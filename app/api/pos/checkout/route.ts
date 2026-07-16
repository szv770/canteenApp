import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Server-side checkout: verifies auth, re-fetches prices from DB so the
// client cannot tamper with amounts, then atomically writes the order.

const MAX_ITEMS = 100
const MAX_QUANTITY_PER_ITEM = 50
const ALLOWED_METHODS = ['balance', 'cash', 'credit_card'] as const
type PayMethod = typeof ALLOWED_METHODS[number]

interface CartItem {
  product_id: string
  variant_id: string | null
  quantity: number
  addon_ids: string[]
  bundle_id: string | null
}

export async function POST(req: NextRequest) {
  // --- Auth check ---
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify cashier is active
  const { data: cashier } = await supabase
    .from('cashier_profiles')
    .select('id, name, role, is_active')
    .eq('id', user.id)
    .single()

  if (!cashier || !cashier.is_active) {
    return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
  }

  // --- Parse body ---
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const methodRaw = String(body.method || '')
  if (!ALLOWED_METHODS.includes(methodRaw as PayMethod)) {
    return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })
  }
  const method = methodRaw as PayMethod

  const bochurId = typeof body.bochur_id === 'string' ? body.bochur_id : null
  const cashTendered =
    method === 'cash' && typeof body.cash_tendered === 'number'
      ? body.cash_tendered
      : null
  const changeToBalance =
    method === 'cash' && bochurId && typeof body.change_to_balance === 'number' && body.change_to_balance > 0
      ? Math.round(body.change_to_balance * 100) / 100
      : null

  const rawItems = Array.isArray(body.items) ? body.items : []
  if (rawItems.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
  }
  if (rawItems.length > MAX_ITEMS) {
    return NextResponse.json({ error: 'Too many items' }, { status: 400 })
  }

  // Validate each item shape
  const items: CartItem[] = []
  for (const raw of rawItems) {
    if (typeof raw !== 'object' || raw === null) {
      return NextResponse.json({ error: 'Invalid cart item' }, { status: 400 })
    }
    const item = raw as Record<string, unknown>
    const bundle_id = typeof item.bundle_id === 'string' ? item.bundle_id : null
    const product_id = typeof item.product_id === 'string' ? item.product_id : ''
    const variant_id = typeof item.variant_id === 'string' ? item.variant_id : null
    const quantity = Number(item.quantity)
    const addon_ids = Array.isArray(item.addon_ids)
      ? (item.addon_ids as unknown[]).filter((a): a is string => typeof a === 'string')
      : []
    if (!bundle_id && !product_id) {
      return NextResponse.json({ error: 'Invalid cart item: missing product_id' }, { status: 400 })
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_ITEM) {
      return NextResponse.json(
        { error: `Invalid quantity for product ${bundle_id ?? product_id}` },
        { status: 400 }
      )
    }
    items.push({ product_id: bundle_id ?? product_id, variant_id, quantity, addon_ids, bundle_id })
  }

  const discountCodeRaw = typeof body.discount_code === 'string' ? body.discount_code.trim() : null
  const tipRaw = typeof body.tip_amount === 'number' ? body.tip_amount : 0
  const tipAmount = Math.round(Math.min(Math.max(0, tipRaw), 100) * 100) / 100

  // --- Re-fetch prices from DB (never trust client-supplied prices) ---
  const admin = createAdminClient()

  // Separate bundle items from regular product items
  const regularItems = items.filter(i => !i.bundle_id)
  const bundleItems = items.filter(i => i.bundle_id)

  // Fetch all referenced products in one query (regular items only)
  const productIds = Array.from(new Set(regularItems.map(i => i.product_id)))
  const productMap = new Map<string, { id: string; name: string; price: number; cost_price: number | null; sale_price: number | null; sale_active: boolean; sale_ends_at: string | null; stock_quantity: number | null; is_active: boolean }>()
  if (productIds.length > 0) {
    const { data: products, error: prodErr } = await admin
      .from('products')
      .select('id, name, price, cost_price, sale_price, sale_active, sale_ends_at, stock_quantity, is_active')
      .in('id', productIds)
    if (prodErr || !products) {
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
    }
    products.forEach(p => productMap.set(p.id, p))
  }

  // Fetch bundles if needed
  const bundleMap = new Map<string, { id: string; name: string; price: number; is_active: boolean; bundle_items: Array<{ product_id: string; quantity: number; products: { name: string } | null }> }>()
  if (bundleItems.length > 0) {
    const bundleIds = Array.from(new Set(bundleItems.map(i => i.bundle_id!)))
    const { data: bundles, error: bundleErr } = await admin
      .from('product_bundles')
      .select('id, name, price, is_active, bundle_items(product_id, quantity, products(name))')
      .in('id', bundleIds)
    if (bundleErr || !bundles) {
      return NextResponse.json({ error: 'Failed to fetch bundles' }, { status: 500 })
    }
    bundles.forEach((b: any) => bundleMap.set(b.id, b))
  }

  // Fetch variants if needed
  const variantIds = regularItems.map(i => i.variant_id).filter(Boolean) as string[]
  const variantMap = new Map<string, { id: string; label: string; price: number; cost_price: number | null; stock_quantity: number | null; is_active: boolean; product_id: string }>()
  if (variantIds.length > 0) {
    const { data: variants, error: varErr } = await admin
      .from('product_variants')
      .select('id, label, price, cost_price, stock_quantity, is_active, product_id')
      .in('id', variantIds)
    if (varErr || !variants) {
      return NextResponse.json({ error: 'Failed to fetch variants' }, { status: 500 })
    }
    variants.forEach(v => variantMap.set(v.id, v))
  }

  // Fetch bochur's account type for per-account discounts (applies regardless of payment method)
  type AccountTypeDiscount = {
    discount_type: string
    discount_value: number
    exclusion_category_ids: string[]
    exclusion_discount_type: string | null
    exclusion_discount_value: number | null
  }
  let accountTypeDiscount: AccountTypeDiscount | null = null
  if (bochurId) {
    const { data: bochurRow } = await admin
      .from('bochurim')
      .select('account_type_id, account_types(discount_type, discount_value, exclusion_category_ids, exclusion_discount_type, exclusion_discount_value, is_active)')
      .eq('id', bochurId)
      .single()
    if (bochurRow) {
      const at = (bochurRow as any).account_types as any
      if (at && at.is_active && at.discount_type !== 'none') {
        accountTypeDiscount = at as AccountTypeDiscount
      }
    }
  }

  // Fetch product-category links for exclusion checks (only if account type has exclusions)
  const productCategoryMap = new Map<string, string[]>()
  if (accountTypeDiscount && productIds.length > 0 &&
    (accountTypeDiscount.exclusion_category_ids?.length ?? 0) > 0) {
    const { data: catLinks } = await admin
      .from('product_categories')
      .select('product_id, category_id')
      .in('product_id', productIds)
    if (catLinks) {
      catLinks.forEach((row: any) => {
        if (!productCategoryMap.has(row.product_id)) productCategoryMap.set(row.product_id, [])
        productCategoryMap.get(row.product_id)!.push(row.category_id)
      })
    }
  }

  // Fetch add-ons if any items have addon_ids
  const allAddonIds = Array.from(new Set(items.flatMap(i => i.addon_ids)))
  const addonMap = new Map<string, { id: string; product_id: string; name: string; price_addition: number; is_active: boolean }>()
  if (allAddonIds.length > 0) {
    const { data: addons } = await admin
      .from('product_addons')
      .select('id, product_id, name, price_addition, is_active')
      .in('id', allAddonIds)
    if (addons) addons.forEach(a => addonMap.set(a.id, a))
  }

  // Build verified order items with server-side prices
  let subtotal = 0
  const orderItems: Array<{
    product_id: string | null
    variant_id: string | null
    product_name: string
    variant_label: string | null
    quantity: number
    unit_price: number
    discount_amount: number
    total: number
    is_bundle_component: boolean
  }> = []

  for (const item of items) {
    // ---- Bundle items ----
    if (item.bundle_id) {
      const bundle = bundleMap.get(item.bundle_id)
      if (!bundle) {
        return NextResponse.json({ error: `Bundle not found: ${item.bundle_id}` }, { status: 400 })
      }
      if (!bundle.is_active) {
        return NextResponse.json({ error: `Bundle is no longer available: ${bundle.name}` }, { status: 400 })
      }
      const itemTotal = Math.round(bundle.price * item.quantity * 100) / 100
      subtotal += itemTotal
      orderItems.push({
        product_id: null,
        variant_id: null,
        product_name: bundle.name,
        variant_label: null,
        quantity: item.quantity,
        unit_price: bundle.price,
        discount_amount: 0,
        total: itemTotal,
        is_bundle_component: false,
      })
      // Attribute component units to their own products at $0 revenue, purely so
      // units-sold/COGS reporting rolls up correctly for the products actually
      // consumed — the bundle line above remains the sole source of order revenue,
      // so this never double-counts money. Flagged so receipts/transaction detail
      // (which show every order_items row) can filter these out.
      for (const bi of bundle.bundle_items) {
        orderItems.push({
          product_id: bi.product_id,
          variant_id: null,
          product_name: bi.products?.name ?? 'Bundle item',
          variant_label: null,
          quantity: bi.quantity * item.quantity,
          unit_price: 0,
          discount_amount: 0,
          total: 0,
          is_bundle_component: true,
        })
      }
      continue
    }

    // ---- Regular product items ----
    const product = productMap.get(item.product_id)
    if (!product) {
      return NextResponse.json(
        { error: `Product not found: ${item.product_id}` },
        { status: 400 }
      )
    }
    if (!product.is_active) {
      return NextResponse.json(
        { error: `Product is no longer available: ${product.name}` },
        { status: 400 }
      )
    }

    let unitPrice: number
    let variantLabel: string | null = null

    if (item.variant_id) {
      const variant = variantMap.get(item.variant_id)
      if (!variant || variant.product_id !== item.product_id) {
        return NextResponse.json(
          { error: `Invalid variant: ${item.variant_id}` },
          { status: 400 }
        )
      }
      if (!variant.is_active) {
        return NextResponse.json(
          { error: `Variant is no longer available` },
          { status: 400 }
        )
      }
      unitPrice = variant.price
      variantLabel = variant.label
    } else {
      // Apply sale price only if active and not expired
      const saleActive = product.sale_active && product.sale_price != null &&
        (!product.sale_ends_at || new Date(product.sale_ends_at) > new Date())
      unitPrice = saleActive ? product.sale_price! : product.price
    }

    // Add validated add-on prices server-side
    let addonTotal = 0
    for (const addonId of item.addon_ids) {
      const addon = addonMap.get(addonId)
      if (!addon || addon.product_id !== item.product_id || !addon.is_active) continue
      addonTotal = Math.round((addonTotal + addon.price_addition) * 100) / 100
    }
    unitPrice = Math.round((unitPrice + addonTotal) * 100) / 100

    // Apply account type discount per item
    let itemDiscountAmount = 0
    if (accountTypeDiscount) {
      const productCats = productCategoryMap.get(item.product_id) || []
      const exclusionIds: string[] = accountTypeDiscount.exclusion_category_ids ?? []
      const isExcluded = exclusionIds.length > 0 && exclusionIds.some(id => productCats.includes(id))
      const dtype = isExcluded ? (accountTypeDiscount.exclusion_discount_type ?? 'none') : accountTypeDiscount.discount_type
      const dval = isExcluded ? (accountTypeDiscount.exclusion_discount_value ?? 0) : accountTypeDiscount.discount_value
      if (dtype === 'percentage' && dval > 0) {
        const discounted = Math.round(unitPrice * (1 - dval / 100) * 100) / 100
        itemDiscountAmount = Math.round((unitPrice - discounted) * 100) / 100
        unitPrice = discounted
      } else if (dtype === 'cost_price') {
        // Per-variant cost_price when the item has a variant (no fallback to the
        // product's own cost_price — a variant with no cost set explicitly gets no
        // cost-price discount); otherwise the product's cost_price. Falls back to
        // the account type's percentage discount if no cost is set either way.
        const cp = item.variant_id ? (variantMap.get(item.variant_id)?.cost_price ?? null) : product.cost_price
        if (cp != null && cp > 0) {
          itemDiscountAmount = Math.round((unitPrice - cp) * 100) / 100
          unitPrice = cp
        } else if (dval > 0) {
          const discounted = Math.round(unitPrice * (1 - dval / 100) * 100) / 100
          itemDiscountAmount = Math.round((unitPrice - discounted) * 100) / 100
          unitPrice = discounted
        }
      }
      // 'fixed' type is applied at order level below, not per item
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return NextResponse.json({ error: 'Invalid product price' }, { status: 500 })
    }

    const itemTotal = Math.round(unitPrice * item.quantity * 100) / 100
    subtotal += itemTotal
    orderItems.push({
      product_id: item.product_id,
      variant_id: item.variant_id,
      product_name: product.name,
      variant_label: variantLabel,
      quantity: item.quantity,
      unit_price: unitPrice,
      discount_amount: itemDiscountAmount,
      total: itemTotal,
      is_bundle_component: false,
    })
  }

  subtotal = Math.round(subtotal * 100) / 100

  // Apply 'fixed' account type discount at order level
  if (accountTypeDiscount?.discount_type === 'fixed' && accountTypeDiscount.discount_value > 0) {
    const fixedDiscount = Math.min(accountTypeDiscount.discount_value, subtotal)
    subtotal = Math.round((subtotal - fixedDiscount) * 100) / 100
  }

  // --- Validate and apply discount code ---
  let discountAmount = 0
  let discountCodeId: string | null = null

  if (discountCodeRaw) {
    const { data: dc } = await admin
      .from('discount_codes')
      .select('*')
      .ilike('code', discountCodeRaw)
      .single()

    if (dc && dc.is_active) {
      const notExpired = !dc.expires_at || new Date(dc.expires_at) > new Date()
      const usesOk = dc.max_uses == null || dc.uses_count < dc.max_uses
      const minOk = subtotal >= dc.min_order_amount

      if (notExpired && usesOk && minOk) {
        if (dc.type === 'percent') {
          discountAmount = Math.round(subtotal * (dc.value / 100) * 100) / 100
        } else {
          discountAmount = Math.min(dc.value, subtotal)
          discountAmount = Math.round(discountAmount * 100) / 100
        }
        discountCodeId = dc.id
      }
    }
  }

  const subtotalAfterDiscount = Math.round((subtotal - discountAmount) * 100) / 100

  // Fetch cc_fee_percent from settings
  const { data: ccFeeSetting } = await admin
    .from('settings')
    .select('value')
    .eq('key', 'cc_fee_percent')
    .single()
  const ccFeePercent = Math.max(0, Math.min(50, parseFloat(String(ccFeeSetting?.value ?? '3'))))
  const ccFee = method === 'credit_card' ? Math.round(subtotalAfterDiscount * (ccFeePercent / 100) * 100) / 100 : 0
  const total = Math.round((subtotalAfterDiscount + ccFee) * 100) / 100
  const grandTotal = Math.round((total + tipAmount) * 100) / 100

  // --- Balance check for bochur payments ---
  let bochurData: { name: string; balance: number; allow_negative: boolean; max_negative_balance: number; is_frozen: boolean; banned_until: string | null; ban_reason: string | null } | null = null
  if (method === 'balance') {
    if (!bochurId) {
      return NextResponse.json(
        { error: 'bochur_id required for balance payment' },
        { status: 400 }
      )
    }
    const { data: bochur } = await admin
      .from('bochurim')
      .select('name, balance, allow_negative, max_negative_balance, is_frozen, banned_until, ban_reason')
      .eq('id', bochurId)
      .eq('archived', false)
      .single()

    if (!bochur) {
      return NextResponse.json({ error: 'Bochur not found' }, { status: 400 })
    }
    if (bochur.is_frozen) {
      return NextResponse.json({ error: 'This account is frozen. Please contact an admin.' }, { status: 403 })
    }
    if (bochur.banned_until && new Date(bochur.banned_until) > new Date()) {
      return NextResponse.json(
        { error: 'Account is temporarily banned', banned_until: bochur.banned_until, ban_reason: bochur.ban_reason },
        { status: 403 }
      )
    }
    bochurData = bochur
    const balanceAfter = Math.round((bochur.balance - subtotalAfterDiscount - tipAmount) * 100) / 100
    const blocked =
      balanceAfter < 0 &&
      (!bochur.allow_negative || -balanceAfter > bochur.max_negative_balance)
    if (blocked) {
      const shortfall = Math.round((-balanceAfter) * 100) / 100
      await admin.from('failed_checkout_log').insert({
        bochur_id: bochurId,
        bochur_name: bochur.name,
        attempted_amount: subtotalAfterDiscount + tipAmount,
        balance_at_time: bochur.balance,
        shortfall,
        cashier_id: user.id,
      }).then(() => {}) // fire-and-forget, don't block response
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 })
    }
  }

  // Cash tendered validation
  if (method === 'cash') {
    if (cashTendered === null || !Number.isFinite(cashTendered) || cashTendered < grandTotal) {
      return NextResponse.json(
        { error: 'Insufficient cash tendered' },
        { status: 400 }
      )
    }
  }

  // --- Write order (admin client to bypass anon RLS for writes) ---
  const { data: order, error: orderErr } = await admin
    .from('orders')
    .insert({
      bochur_id: bochurId,
      cashier_id: user.id,
      subtotal,
      discount_amount: discountAmount,
      total,
      tip_amount: tipAmount || null,
      status: 'completed',
    })
    .select()
    .single()

  if (orderErr || !order) {
    console.error('[checkout] Order insert error:', orderErr?.message)
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  }

  // Order items
  const { error: itemsErr } = await admin.from('order_items').insert(
    orderItems.map(i => ({ ...i, order_id: order.id }))
  )
  if (itemsErr) {
    console.error('[checkout] Order items error:', itemsErr.message)
  }

  // Payment record
  const change = method === 'cash' ? Math.max(0, Math.round(((cashTendered ?? 0) - grandTotal) * 100) / 100) : null
  await admin.from('payments').insert({
    order_id: order.id,
    method,
    amount: grandTotal,
    cash_tendered: cashTendered,
    change_given: change,
    cc_fee: ccFee || null,
  })

  // Balance deduction (includes tip if method=balance)
  if (method === 'balance' && bochurId && bochurData) {
    const totalDeducted = Math.round((subtotalAfterDiscount + tipAmount) * 100) / 100
    const balanceAfter = Math.round((bochurData.balance - totalDeducted) * 100) / 100
    await admin.from('bochurim').update({ balance: balanceAfter }).eq('id', bochurId)
    await admin.from('balance_ledger').insert({
      bochur_id: bochurId,
      amount: -totalDeducted,
      type: 'purchase',
      method: 'balance',
      order_id: order.id,
      cashier_id: user.id,
      note: tipAmount > 0 ? `Includes ${tipAmount} tip` : null,
    })
  }

  // Credit tip — if cashier has a linked bochur account, credit there; otherwise pool in tip_balance
  if (tipAmount > 0) {
    const { data: tipRoutingSetting } = await admin.from('settings').select('value').eq('key', 'tip_routing').single()
    const tipRouting = String(tipRoutingSetting?.value ?? 'cashier_balance').replace(/"/g, '')
    if (tipRouting === 'cashier_balance') {
      const { data: cashierRow } = await admin
        .from('cashier_profiles').select('tip_balance, bochur_id').eq('id', user.id).single()
      if (cashierRow?.bochur_id) {
        // Linked bochur account — credit balance and log to ledger
        const { data: bochurRow } = await admin.from('bochurim').select('balance').eq('id', cashierRow.bochur_id).single()
        if (bochurRow) {
          const newBal = Math.round((Number(bochurRow.balance) + tipAmount) * 100) / 100
          await admin.from('bochurim').update({ balance: newBal }).eq('id', cashierRow.bochur_id)
          await admin.from('balance_ledger').insert({
            bochur_id: cashierRow.bochur_id,
            amount: tipAmount,
            type: 'tip',
            method: 'tip',
            order_id: order.id,
            cashier_id: user.id,
            note: `Tip from order`,
          })
        }
      } else if (cashierRow) {
        // No linked account — accumulate in tip_balance for cash payout
        await admin.from('cashier_profiles')
          .update({ tip_balance: Math.round(((cashierRow.tip_balance || 0) + tipAmount) * 100) / 100 })
          .eq('id', user.id)
      }
      // Log to tips table either way
      await admin.from('tips').insert({
        order_id: order.id,
        cashier_id: user.id,
        amount: tipAmount,
        method,
        paid_out: !!cashierRow?.bochur_id,
        note: cashierRow?.bochur_id ? 'Credited to linked bochur account' : 'Pending cash payout',
      }).then(() => {})
    }
  }

  // Increment discount code uses_count atomically via DB function
  // (avoids read-then-write race when two checkouts use the same code simultaneously)
  if (discountCodeId) {
    await admin.rpc('increment_discount_uses', { code_id: discountCodeId })
  }

  // Stock updates (skip if stock_quantity is null = untracked)
  for (const item of items) {
    if (item.bundle_id) {
      // Deduct stock for each bundle component product
      const bundle = bundleMap.get(item.bundle_id)
      if (bundle) {
        for (const bi of bundle.bundle_items) {
          const prod = productMap.get(bi.product_id)
          if (prod && prod.stock_quantity !== null) {
            const newStock = Math.max(0, prod.stock_quantity - bi.quantity * item.quantity)
            await admin.from('products').update({ stock_quantity: newStock }).eq('id', bi.product_id)
          }
        }
      }
    } else if (item.variant_id) {
      const variant = variantMap.get(item.variant_id)!
      if (variant.stock_quantity !== null) {
        const newVariantStock = Math.max(0, variant.stock_quantity - item.quantity)
        await admin.from('product_variants')
          .update({ stock_quantity: newVariantStock })
          .eq('id', item.variant_id)
      }
    } else {
      const product = productMap.get(item.product_id)
      if (product && product.stock_quantity !== null) {
        const newStock = Math.max(0, product.stock_quantity - item.quantity)
        await admin.from('products').update({ stock_quantity: newStock }).eq('id', item.product_id)
      }
    }
  }

  // Credit change to student balance if requested
  if (changeToBalance && bochurId) {
    const { data: bRow } = await admin.from('bochurim').select('balance, name').eq('id', bochurId).single()
    if (bRow) {
      const newBal = Math.round((Number(bRow.balance) + changeToBalance) * 100) / 100
      await admin.from('bochurim').update({ balance: newBal }).eq('id', bochurId)
      await admin.from('balance_ledger').insert({
        bochur_id: bochurId,
        amount: changeToBalance,
        type: 'topup',
        // Distinct from a plain topup's null method — this is real cash that
        // stayed in the drawer (never handed back as change), so Accounts
        // needs to add it to the cash total even though `payments.amount`
        // only ever recorded the order subtotal, not the tendered amount.
        method: 'cash_change',
        note: `Cash change credited to balance (Order #${order.id.slice(-6)})`,
      })
    }
  }

  return NextResponse.json({ ok: true, order_id: order.id, total }, { status: 201 })
}
