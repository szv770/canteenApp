import type { SupabaseClient } from '@supabase/supabase-js'
import { computePreorderUnitPrice } from './preorderPricing'
import { isBeforeCutoff } from './preorderCutoff'

const MAX_ITEMS = 20
const MAX_QUANTITY_PER_ITEM = 30

export interface PlacePreorderInput {
  bochurId: string
  forDate: string
  items: { product_id: string; quantity: number }[]
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
    if (!Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > MAX_QUANTITY_PER_ITEM) {
      return { ok: false, status: 400, error: 'Invalid quantity' }
    }
  }

  const { data: cutoffSetting } = await admin.from('settings').select('value').eq('key', 'preorder_cutoff_time').single()
  const cutoffTime = String(cutoffSetting?.value ?? '20:00').replace(/"/g, '')
  if (!isBeforeCutoff(forDate, cutoffTime)) {
    return { ok: false, status: 400, error: 'Ordering for this date has closed.' }
  }

  const { data: bochur } = await admin
    .from('bochurim')
    .select('id, name, is_frozen, banned_until, archived, account_type_id, account_types(discount_type, discount_value, is_staff_pricing_tier, is_active)')
    .eq('id', bochurId)
    .eq('archived', false)
    .single()
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

  const productIds = Array.from(new Set(items.map(i => i.product_id)))
  const { data: products } = await admin
    .from('products')
    .select('id, name, price, cost_price, staff_price, preorder_source, preorder_daily_cap, allow_preorder, is_active')
    .in('id', productIds)
  const productMap = new Map((products || []).map((p: any) => [p.id, p]))

  for (const item of items) {
    const p = productMap.get(item.product_id)
    if (!p || !p.is_active || !p.allow_preorder) {
      return { ok: false, status: 400, error: `Item is no longer orderable: ${p?.name ?? item.product_id}` }
    }
  }

  // If editing, confirm the existing order belongs to this bochur/date and is still pending.
  if (existingPreorderId) {
    const { data: existing } = await admin
      .from('preorders')
      .select('id, bochur_id, for_date, status')
      .eq('id', existingPreorderId)
      .single()
    if (!existing || existing.bochur_id !== bochurId || existing.for_date !== forDate) {
      return { ok: false, status: 404, error: 'Order not found' }
    }
    if (existing.status !== 'pending') {
      return { ok: false, status: 400, error: 'This order can no longer be edited' }
    }
  }

  // Daily cap check (best-effort, not fully race-proof under simultaneous
  // submissions for the same capped item — acceptable for this feature's
  // volume; see CLAUDE.md).
  for (const item of items) {
    const p = productMap.get(item.product_id)
    if (p.preorder_daily_cap == null) continue
    const { data: existingItems } = await admin
      .from('preorder_items')
      .select('quantity, preorder_id, preorders!inner(for_date, status)')
      .eq('product_id', item.product_id)
      .eq('preorders.for_date', forDate)
      .neq('preorders.status', 'cancelled')
    const committed = (existingItems || [])
      .filter((row: any) => row.preorder_id !== existingPreorderId)
      .reduce((sum: number, row: any) => sum + Number(row.quantity), 0)
    if (committed + item.quantity > p.preorder_daily_cap) {
      const remaining = Math.max(0, p.preorder_daily_cap - committed)
      return { ok: false, status: 400, error: `Only ${remaining} of "${p.name}" left for that date` }
    }
  }

  let total = 0
  let staffPricingApplied = false
  const itemRows = items.map(item => {
    const p = productMap.get(item.product_id)
    const { unitPrice, staffPricingApplied: applied } = computePreorderUnitPrice(
      { price: Number(p.price), cost_price: p.cost_price != null ? Number(p.cost_price) : null, staff_price: p.staff_price != null ? Number(p.staff_price) : null },
      accountType
    )
    if (applied) staffPricingApplied = true
    total += unitPrice * item.quantity
    return {
      product_id: p.id,
      product_name: p.name,
      quantity: item.quantity,
      unit_price: unitPrice,
      cost_price: p.cost_price != null ? Number(p.cost_price) : null,
      preorder_source: p.preorder_source as 'vendor' | 'in_house',
    }
  })
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

  return { ok: true, status: existingPreorderId ? 200 : 201, preorderId: preorderId!, total, staffPricingApplied }
}
