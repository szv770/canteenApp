import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Physical stock counts — Season Close → Leftover Stock tab.
//
// Kept separate from lib/seasonClose.ts on purpose: that file is strictly
// read-only (see its own header comment), and this is the one write path on
// the Leftover Stock tab. Same split as lib/programSettlements.ts sitting
// alongside lib/seasonClose.ts for the Student Balances tab's settlement
// actions.
//
// What one call to recordStockCount() does, always in this order:
//   1. Insert a permanent `stock_counts` audit row — regardless of variance
//      sign, this is the record that a count was taken at all.
//   2. If stock is MISSING (system > counted), also log a `wastage_log` row
//      tagged reason='shrinkage' for the missing amount — a real dollar loss
//      with no known cause.
//   3. If MORE was found than expected (system < counted), do nothing extra —
//      per explicit product-owner direction, an over-count is informational
//      only and is never treated as a gain/profit. The audit row alone is the
//      complete record.
//   4. Set products.stock_quantity (or product_variants.stock_quantity for a
//      variant) directly to the counted value — a human just asserted a
//      known-true number, so this is a plain `.eq('id', ...)` update, not a
//      delta. That's NOT the same race-condition class as checkout's
//      increment/decrement (CLAUDE.md gotcha #32/#40) — there's nothing to
//      race against when you're overwriting with an authoritative figure.
// ─────────────────────────────────────────────────────────────────────────────

export interface RecordStockCountParams {
  productId: string
  /** Null for a plain (non-variant) product. */
  variantId: string | null
  /** Snapshot name for the wastage_log row, same pattern as order_items/preorder_items snapshots. */
  productName: string
  /** The stock figure the system showed before this count was applied. */
  systemQuantity: number
  countedQuantity: number
  /** Effective cost-per-unit for this product/variant (already resolved with
   *  the product-level fallback by the caller) — used as wastage_log.unit_cost. */
  costPrice: number | null
  note?: string | null
}

export interface RecordStockCountResult {
  variance: number
  error?: string
}

export async function recordStockCount(
  supabase: SupabaseClient,
  params: RecordStockCountParams
): Promise<RecordStockCountResult> {
  const variance = params.systemQuantity - params.countedQuantity

  // Resolve a display name for the audit row without a cross-schema join
  // (CLAUDE.md gotcha #18 — counted_by has no public-schema FK to traverse).
  // cashier_profiles.id is set equal to auth.users.id at account creation, so
  // a direct lookup by the current user's id works without an RPC or extra
  // grant.
  const { data: userRes } = await supabase.auth.getUser()
  const userId = userRes?.user?.id ?? null
  let countedByName: string | null = null
  if (userId) {
    const { data: profile } = await supabase.from('cashier_profiles').select('name').eq('id', userId).maybeSingle()
    countedByName = (profile as any)?.name ?? null
  }

  const { error: insertErr } = await supabase.from('stock_counts').insert({
    product_id: params.productId,
    variant_id: params.variantId,
    system_quantity_at_count: params.systemQuantity,
    counted_quantity: params.countedQuantity,
    variance,
    counted_by: userId,
    counted_by_name: countedByName,
    note: params.note?.trim() || null,
  })
  if (insertErr) return { variance, error: 'Failed to save count: ' + insertErr.message }

  if (variance > 0) {
    const { error: wastErr } = await supabase.from('wastage_log').insert({
      product_id: params.productId,
      product_name: params.productName,
      quantity: variance,
      reason: 'shrinkage',
      unit_cost: params.costPrice ?? 0,
      unit_price: 0,
      notes: `Physical count discrepancy: system showed ${params.systemQuantity}, counted ${params.countedQuantity}.`,
      cashier_id: null,
    })
    if (wastErr) return { variance, error: 'Count saved, but failed to log the shrinkage: ' + wastErr.message }
  }

  const table = params.variantId ? 'product_variants' : 'products'
  const id = params.variantId ?? params.productId
  const { error: updateErr } = await supabase.from(table).update({ stock_quantity: params.countedQuantity }).eq('id', id)
  if (updateErr) return { variance, error: 'Count saved, but failed to update the stock level: ' + updateErr.message }

  return { variance }
}
