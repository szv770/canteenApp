import type { SupabaseClient } from '@supabase/supabase-js'
import { computePreorderUnitPrice } from './preorderPricing'
import { isBeforeCutoff } from './preorderCutoff'

const MAX_ITEMS = 20
const MAX_QUANTITY_PER_ITEM = 30

// A cart line is either a single product (optionally with add-ons) or a
// bundle — exactly one of product_id / bundle_id, same shape/validation style
// as the regular POS checkout route's cart items.
export interface PlacePreorderItemInput {
  product_id?: string | null
  bundle_id?: string | null
  quantity: number
  addon_ids?: string[]
}

export interface PlacePreorderInput {
  bochurId: string
  forDate: string
  items: PlacePreorderItemInput[]
  placedVia: 'pos' | 'public_link'
  cashierId: string | null
  // When editing an existing pending order (self-edit before cutoff, or a
  // cashier correcting one at the POS) instead of creating a new one.
  existingPreorderId?: string | null
}

export interface PlacePreorderResult {
  ok: boolean
  status: number
  error?: string
  preorderId?: string
  total?: number
  staffPricingApplied?: boolean
}

interface PreorderItemRow {
  product_id: string | null
  bundle_id: string | null
  product_name: string
  quantity: number
  unit_price: number
  cost_price: number | null
  preorder_source: 'vendor' | 'in_house' | null
  is_bundle_component: boolean
  addon_ids: string[] | null
  addon_names: string[] | null
  addon_total: number
}

// Shared by both the POS and public-link routes so cutoff/cap/pricing
// validation only lives in one place and can never be dictated by the
// client. Always call with a service-role (admin) client — the public link
// has no authenticated session at all, and even the POS route re-derives
// prices server-side rather than trusting the cart.
export async function placePreorder(admin: SupabaseClient, input: PlacePreorderInput): Promise<PlacePreorderResult> {
  const { bochurId, forDate, items, placedVia, cashierId, existingPreorderId } = input

  if (!bochurId) return { ok: false, status: 400, error: 'bochur_id is required' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(forDate)) return { ok: false, status: 400, error: 'Invalid date' }
  if (items.length === 0) return { ok: false, status: 400, error: 'No items selected' }
  if (items.length > MAX_ITEMS) return { ok: false, status: 400, error: 'Too many items' }
  for (const i of items) {
    const hasProduct = typeof i.product_id === 'string' && i.product_id.length > 0
    const hasBundle = typeof i.bundle_id === 'string' && i.bundle_id.length > 0
    if (hasProduct === hasBundle) {
      return { ok: false, status: 400, error: 'Each item must reference exactly one product or bundle' }
    }
    if (!Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > MAX_QUANTITY_PER_ITEM) {
      return { ok: false, status: 400, error: 'Invalid quantity' }
    }
  }

  const { data: cutoffSettings, error: cutoffErr } = await admin
    .from('settings')
    .select('key, value')
    .in('key', ['preorder_cutoff_time', 'preorder_same_day_cutoff_time'])
  if (cutoffErr) console.error('placePreorder: failed to load cutoff settings, falling back to 20:00', cutoffErr)
  const settingMap: Record<string, string> = {}
  ;(cutoffSettings || []).forEach((s: any) => { settingMap[s.key] = String(s.value ?? '').replace(/"/g, '') })
  const cutoffTime = settingMap['preorder_cutoff_time'] || '20:00'
  // Blank/absent falls back to the advance cutoff inside cutoffDeadlineForDate.
  const sameDayCutoffTime = settingMap['preorder_same_day_cutoff_time'] || undefined
  if (!isBeforeCutoff(forDate, cutoffTime, new Date(), undefined, sameDayCutoffTime)) {
    return { ok: false, status: 400, error: 'Ordering for this date has closed.' }
  }

  const { data: bochur, error: bochurErr } = await admin
    .from('bochurim')
    .select('id, name, is_frozen, banned_until, archived, account_type_id, account_types(discount_type, discount_value, is_staff_pricing_tier, is_active)')
    .eq('id', bochurId)
    .eq('archived', false)
    .single()
  if (bochurErr) console.error('placePreorder: failed to load bochur', bochurErr)
  if (!bochur) return { ok: false, status: 400, error: 'Account not found' }
  if (bochur.is_frozen) return { ok: false, status: 403, error: 'This account is frozen. Please contact an admin.' }
  if (bochur.banned_until && new Date(bochur.banned_until) > new Date()) {
    return { ok: false, status: 403, error: 'This account is temporarily restricted. Please contact an admin.' }
  }
  const at = (bochur as any).account_types as any
  const accountType = at && at.is_active ? {
    discount_type: at.discount_type as 'none' | 'percentage' | 'cost_price' | 'fixed',
    discount_value: Number(at.discount_value || 0),
    is_staff_pricing_tier: !!at.is_staff_pricing_tier,
  } : null

  const productLines = items.filter(i => !i.bundle_id)
  const bundleLines = items.filter(i => !!i.bundle_id)

  // --- Bundles (fetched first: their components feed the products query below) ---
  // Needs cost_price + preorder_source per component, unlike checkout's own
  // equivalent query — Preorders attributes vendor cost and vendor/in-house
  // routing at line-item granularity, which checkout never does.
  type BundleRow = {
    id: string
    name: string
    price: number
    is_active: boolean
    allow_preorder: boolean
    bundle_items: Array<{ product_id: string; quantity: number; products: { name: string; cost_price: number | null; preorder_source: 'vendor' | 'in_house' | null } | null }>
  }
  const bundleMap = new Map<string, BundleRow>()
  if (bundleLines.length > 0) {
    const bundleIds = Array.from(new Set(bundleLines.map(i => i.bundle_id!)))
    const { data: bundles, error: bundlesErr } = await admin
      .from('product_bundles')
      .select('id, name, price, is_active, allow_preorder, bundle_items(product_id, quantity, products(name, cost_price, preorder_source))')
      .in('id', bundleIds)
    if (bundlesErr) {
      console.error('placePreorder: failed to load bundles', bundlesErr)
      return { ok: false, status: 500, error: 'Could not verify item availability — please try again' }
    }
    ;(bundles || []).forEach((b: any) => bundleMap.set(b.id, b))

    for (const item of bundleLines) {
      const b = bundleMap.get(item.bundle_id!)
      if (!b || !b.is_active || !b.allow_preorder) {
        return { ok: false, status: 400, error: `Deal is no longer orderable: ${b?.name ?? item.bundle_id}` }
      }
    }
  }

  // Products: the directly-ordered ones plus every bundle component, since
  // daily caps apply per product regardless of how it got into the cart.
  const directProductIds = Array.from(new Set(productLines.map(i => i.product_id!)))
  const componentProductIds = Array.from(bundleMap.values()).flatMap(b => (b.bundle_items || []).map(bi => bi.product_id))
  const allProductIds = Array.from(new Set([...directProductIds, ...componentProductIds]))
  const productMap = new Map<string, any>()
  if (allProductIds.length > 0) {
    const { data: products, error: productsErr } = await admin
      .from('products')
      .select('id, name, price, cost_price, staff_price, preorder_source, preorder_daily_cap, allow_preorder, is_active')
      .in('id', allProductIds)
    if (productsErr) {
      console.error('placePreorder: failed to load products', productsErr)
      return { ok: false, status: 500, error: 'Could not verify item availability — please try again' }
    }
    ;(products || []).forEach((p: any) => productMap.set(p.id, p))
  }

  // allow_preorder is only required for directly-ordered products — a bundle
  // component rides along on the bundle's own allow_preorder flag.
  for (const item of productLines) {
    const p = productMap.get(item.product_id!)
    if (!p || !p.is_active || !p.allow_preorder) {
      return { ok: false, status: 400, error: `Item is no longer orderable: ${p?.name ?? item.product_id}` }
    }
  }

  // --- Add-ons (batched once, same pattern as the checkout route) ---
  const allAddonIds = Array.from(new Set(items.flatMap(i => i.addon_ids || [])))
  const addonMap = new Map<string, { id: string; product_id: string; name: string; price_addition: number; is_active: boolean }>()
  if (allAddonIds.length > 0) {
    const { data: addons, error: addonsErr } = await admin
      .from('product_addons')
      .select('id, product_id, name, price_addition, is_active')
      .in('id', allAddonIds)
    if (addonsErr) {
      console.error('placePreorder: failed to load add-ons', addonsErr)
      return { ok: false, status: 500, error: 'Could not price your add-ons — please try again' }
    }
    ;(addons || []).forEach((a: any) => addonMap.set(a.id, a))
  }

  // If editing, confirm the existing order belongs to this bochur/date and is still pending.
  if (existingPreorderId) {
    const { data: existing, error: existingErr } = await admin
      .from('preorders')
      .select('id, bochur_id, for_date, status')
      .eq('id', existingPreorderId)
      .single()
    if (existingErr) console.error('placePreorder: failed to load existing order', existingErr)
    if (!existing || existing.bochur_id !== bochurId || existing.for_date !== forDate) {
      return { ok: false, status: 404, error: 'Order not found' }
    }
    if (existing.status !== 'pending') {
      return { ok: false, status: 400, error: 'This order can no longer be edited' }
    }
  }

  // Daily caps are a per-*product* limit, so bundles have to be expanded into
  // the products they actually consume before the cap can be checked at all —
  // otherwise a "burger + drink" deal could push the burger product past its
  // cap with zero enforcement, since the top-level line references only the
  // bundle. Direct product lines pass through unchanged.
  const expandedComponents: { product_id: string; quantity: number }[] = []
  for (const item of items) {
    if (item.bundle_id) {
      const b = bundleMap.get(item.bundle_id)!
      for (const bi of b.bundle_items || []) {
        expandedComponents.push({ product_id: bi.product_id, quantity: bi.quantity * item.quantity })
      }
    } else {
      expandedComponents.push({ product_id: item.product_id!, quantity: item.quantity })
    }
  }
  const requestedByProduct = new Map<string, number>()
  for (const c of expandedComponents) {
    requestedByProduct.set(c.product_id, (requestedByProduct.get(c.product_id) || 0) + c.quantity)
  }

  // Daily cap check (best-effort, not fully race-proof under simultaneous
  // submissions for the same capped item — acceptable for this feature's
  // volume; see CLAUDE.md).
  for (const [productId, requestedQty] of Array.from(requestedByProduct.entries())) {
    const p = productMap.get(productId)
    if (!p || p.preorder_daily_cap == null) continue
    const { data: existingItems, error: capErr } = await admin
      .from('preorder_items')
      .select('quantity, preorder_id, preorders!inner(for_date, status)')
      .eq('product_id', productId)
      .eq('preorders.for_date', forDate)
      .neq('preorders.status', 'cancelled')
    if (capErr) {
      // Fail closed rather than silently treating a failed lookup as "nothing
      // committed yet" — that would let a capped item be oversold on a
      // transient DB error instead of just asking the user to retry.
      console.error('placePreorder: cap check query failed', capErr)
      return { ok: false, status: 500, error: 'Could not verify item availability — please try again' }
    }
    const committed = (existingItems || [])
      .filter((row: any) => row.preorder_id !== existingPreorderId)
      .reduce((sum: number, row: any) => sum + Number(row.quantity), 0)
    if (committed + requestedQty > p.preorder_daily_cap) {
      const remaining = Math.max(0, p.preorder_daily_cap - committed)
      return { ok: false, status: 400, error: `Only ${remaining} of "${p.name}" left for that date` }
    }
  }

  let total = 0
  let staffPricingApplied = false
  const itemRows: PreorderItemRow[] = []

  for (const item of items) {
    // ---- Bundle lines ----
    // Bundles always sell at their flat bundle price — no staff-price override
    // or account-type discount applies (same as regular POS checkout, which
    // also skips the discount block for bundle lines).
    if (item.bundle_id) {
      const bundle = bundleMap.get(item.bundle_id)!
      const unitPrice = Math.round(Number(bundle.price) * 100) / 100
      total += unitPrice * item.quantity
      itemRows.push({
        product_id: null,
        bundle_id: bundle.id,
        product_name: bundle.name,
        quantity: item.quantity,
        unit_price: unitPrice,
        cost_price: null,
        // The parent row isn't inherently vendor-or-in-house — its components
        // can differ — so it carries no source and is skipped by the vendor
        // ledger / send-to-vendor tallies, which read the component rows below.
        preorder_source: null,
        is_bundle_component: false,
        addon_ids: null,
        addon_names: null,
        addon_total: 0,
      })
      // Zero-revenue component rows purely so per-product COGS/units and the
      // vendor owed/prep tallies attribute what's actually consumed. The parent
      // row above remains the sole source of this line's revenue.
      for (const bi of bundle.bundle_items || []) {
        itemRows.push({
          product_id: bi.product_id,
          bundle_id: null,
          product_name: bi.products?.name ?? 'Bundle item',
          quantity: bi.quantity * item.quantity,
          unit_price: 0,
          cost_price: bi.products?.cost_price != null ? Number(bi.products.cost_price) : null,
          preorder_source: bi.products?.preorder_source ?? null,
          is_bundle_component: true,
          addon_ids: null,
          addon_names: null,
          addon_total: 0,
        })
      }
      continue
    }

    // ---- Regular product lines ----
    const p = productMap.get(item.product_id!)
    // Validated server-side against this product: silently skip anything that
    // doesn't belong to it or is no longer active, same as checkout does.
    let addonTotal = 0
    const matchedAddonIds: string[] = []
    const matchedAddonNames: string[] = []
    for (const addonId of item.addon_ids || []) {
      const addon = addonMap.get(addonId)
      if (!addon || addon.product_id !== item.product_id || !addon.is_active) continue
      addonTotal = Math.round((addonTotal + Number(addon.price_addition)) * 100) / 100
      matchedAddonIds.push(addon.id)
      matchedAddonNames.push(addon.name)
    }

    const { unitPrice, staffPricingApplied: applied } = computePreorderUnitPrice(
      { price: Number(p.price), cost_price: p.cost_price != null ? Number(p.cost_price) : null, staff_price: p.staff_price != null ? Number(p.staff_price) : null },
      accountType,
      addonTotal
    )
    if (applied) staffPricingApplied = true
    total += unitPrice * item.quantity
    itemRows.push({
      product_id: p.id,
      bundle_id: null,
      product_name: p.name,
      quantity: item.quantity,
      unit_price: unitPrice,
      cost_price: p.cost_price != null ? Number(p.cost_price) : null,
      preorder_source: p.preorder_source as 'vendor' | 'in_house',
      is_bundle_component: false,
      // null rather than an empty array when nothing was picked, matching how
      // every other optional column on this row is written.
      addon_ids: matchedAddonIds.length > 0 ? matchedAddonIds : null,
      addon_names: matchedAddonNames.length > 0 ? matchedAddonNames : null,
      addon_total: addonTotal,
    })
  }
  total = Math.round(total * 100) / 100

  let preorderId = existingPreorderId ?? null
  if (preorderId) {
    const { error: updErr } = await admin
      .from('preorders')
      .update({ total_amount: total, is_staff_pricing: staffPricingApplied, updated_at: new Date().toISOString() })
      .eq('id', preorderId)
    if (updErr) return { ok: false, status: 500, error: 'Failed to update order' }
    await admin.from('preorder_items').delete().eq('preorder_id', preorderId)
  } else {
    const { data: inserted, error: insErr } = await admin
      .from('preorders')
      .insert({
        bochur_id: bochurId,
        for_date: forDate,
        status: 'pending',
        placed_via: placedVia,
        cashier_id: cashierId,
        is_staff_pricing: staffPricingApplied,
        total_amount: total,
      })
      .select('id')
      .single()
    if (insErr || !inserted) return { ok: false, status: 500, error: 'Failed to create order' }
    preorderId = inserted.id
  }

  const { error: itemsErr } = await admin.from('preorder_items').insert(
    itemRows.map(row => ({ ...row, preorder_id: preorderId }))
  )
  if (itemsErr) return { ok: false, status: 500, error: 'Failed to save order items' }

  // Re-check capped items after inserting. The pre-insert check above can
  // still race under two truly simultaneous submissions (see CLAUDE.md
  // gotcha #32 — no SELECT FOR UPDATE/RPC), but re-verifying immediately
  // after our own insert lands narrows that window: whichever request's
  // insert commits second will see the other's row already counted and can
  // undo itself, instead of leaving two orders both standing over the cap.
  // Runs on the same bundle-expanded per-product quantities as the pre-insert pass.
  for (const productId of Array.from(requestedByProduct.keys())) {
    const p = productMap.get(productId)
    if (!p || p.preorder_daily_cap == null) continue
    const { data: postInsertItems, error: postCapErr } = await admin
      .from('preorder_items')
      .select('quantity, preorders!inner(for_date, status)')
      .eq('product_id', productId)
      .eq('preorders.for_date', forDate)
      .neq('preorders.status', 'cancelled')
    if (postCapErr) {
      console.error('placePreorder: post-insert cap re-check failed', postCapErr)
      continue
    }
    const committed = (postInsertItems || []).reduce((sum: number, row: any) => sum + Number(row.quantity), 0)
    if (committed > p.preorder_daily_cap) {
      await admin.from('preorders').update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: 'Daily cap reached by a concurrent order',
      }).eq('id', preorderId)
      return { ok: false, status: 409, error: `"${p.name}" just sold out for that date — remove it or pick another date and try again.` }
    }
  }

  return { ok: true, status: existingPreorderId ? 200 : 201, preorderId: preorderId!, total, staffPricingApplied }
}
