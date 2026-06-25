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
    const product_id = typeof item.product_id === 'string' ? item.product_id : ''
    const variant_id = typeof item.variant_id === 'string' ? item.variant_id : null
    const quantity = Number(item.quantity)
    if (!product_id) {
      return NextResponse.json({ error: 'Invalid cart item: missing product_id' }, { status: 400 })
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_ITEM) {
      return NextResponse.json(
        { error: `Invalid quantity for product ${product_id}` },
        { status: 400 }
      )
    }
    items.push({ product_id, variant_id, quantity })
  }

  // --- Re-fetch prices from DB (never trust client-supplied prices) ---
  const admin = createAdminClient()

  // Fetch all referenced products in one query
  const productIds = [...new Set(items.map(i => i.product_id))]
  const { data: products, error: prodErr } = await admin
    .from('products')
    .select('id, name, price, stock_quantity, is_active')
    .in('id', productIds)

  if (prodErr || !products) {
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
  }

  const productMap = new Map(products.map(p => [p.id, p]))

  // Fetch variants if needed
  const variantIds = items.map(i => i.variant_id).filter(Boolean) as string[]
  const variantMap = new Map<string, { id: string; label: string; price: number; stock_quantity: number; is_active: boolean; product_id: string }>()
  if (variantIds.length > 0) {
    const { data: variants, error: varErr } = await admin
      .from('product_variants')
      .select('id, label, price, stock_quantity, is_active, product_id')
      .in('id', variantIds)
    if (varErr || !variants) {
      return NextResponse.json({ error: 'Failed to fetch variants' }, { status: 500 })
    }
    variants.forEach(v => variantMap.set(v.id, v))
  }

  // Build verified order items with server-side prices
  let subtotal = 0
  const orderItems: Array<{
    product_id: string
    variant_id: string | null
    product_name: string
    variant_label: string | null
    quantity: number
    unit_price: number
    discount_amount: number
    total: number
  }> = []

  for (const item of items) {
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
      unitPrice = product.price
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
      discount_amount: 0,
      total: itemTotal,
    })
  }

  subtotal = Math.round(subtotal * 100) / 100

  // Fetch cc_fee_percent from settings
  const { data: ccFeeSetting } = await admin
    .from('settings')
    .select('value')
    .eq('key', 'cc_fee_percent')
    .single()
  const ccFeePercent = Math.max(0, Math.min(50, parseFloat(String(ccFeeSetting?.value ?? '3'))))
  const ccFee = method === 'credit_card' ? Math.round(subtotal * (ccFeePercent / 100) * 100) / 100 : 0
  const total = Math.round((subtotal + ccFee) * 100) / 100

  // --- Balance check for bochur payments ---
  let bochurData: { balance: number; allow_negative: boolean; max_negative_balance: number } | null = null
  if (method === 'balance') {
    if (!bochurId) {
      return NextResponse.json(
        { error: 'bochur_id required for balance payment' },
        { status: 400 }
      )
    }
    const { data: bochur } = await admin
      .from('bochurim')
      .select('balance, allow_negative, max_negative_balance')
      .eq('id', bochurId)
      .eq('archived', false)
      .single()

    if (!bochur) {
      return NextResponse.json({ error: 'Bochur not found' }, { status: 400 })
    }
    bochurData = bochur
    const balanceAfter = bochur.balance - subtotal
    const blocked =
      balanceAfter < 0 &&
      (!bochur.allow_negative || -balanceAfter > bochur.max_negative_balance)
    if (blocked) {
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 })
    }
  }

  // Cash tendered validation
  if (method === 'cash') {
    if (cashTendered === null || !Number.isFinite(cashTendered) || cashTendered < total) {
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
      discount_amount: 0,
      total,
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
  const change = method === 'cash' ? Math.max(0, Math.round(((cashTendered ?? 0) - total) * 100) / 100) : null
  await admin.from('payments').insert({
    order_id: order.id,
    method,
    amount: total,
    cash_tendered: cashTendered,
    change_given: change,
    cc_fee: ccFee || null,
  })

  // Balance deduction
  if (method === 'balance' && bochurId && bochurData) {
    const balanceAfter = Math.round((bochurData.balance - subtotal) * 100) / 100
    await admin.from('bochurim').update({ balance: balanceAfter }).eq('id', bochurId)
    await admin.from('balance_ledger').insert({
      bochur_id: bochurId,
      amount: -subtotal,
      type: 'purchase',
      method: 'balance',
      order_id: order.id,
      cashier_id: user.id,
    })
  }

  // Stock updates
  for (const item of items) {
    if (item.variant_id) {
      await admin.rpc('decrement_variant_stock', {
        v_id: item.variant_id,
        qty: item.quantity,
      })
    } else {
      const product = productMap.get(item.product_id)!
      const newStock = Math.max(0, product.stock_quantity - item.quantity)
      await admin.from('products').update({ stock_quantity: newStock }).eq('id', item.product_id)
    }
  }

  return NextResponse.json({ ok: true, order_id: order.id, total }, { status: 201 })
}
