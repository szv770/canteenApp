import type { SupabaseClient } from '@supabase/supabase-js'
import { localDateStrInTz } from '@/lib/preorderCutoff'

// ─────────────────────────────────────────────────────────────────────────────
// Season Close — read-only data gathering for the end-of-summer wind-down.
//
// Everything in this file ANSWERS a question; nothing in it DECIDES anything.
// No function here writes to the database, moves money, cancels an order, or
// zeroes a balance. Whether an unspent balance gets refunded / forfeited /
// carried over, whether leftover stock is written off or kept for next season,
// and whether a stale pending preorder gets cancelled are all business-policy
// calls for the owner — this just makes it possible to see WHO and WHAT is
// affected, in one place, instead of opening 200 student profiles one at a
// time or stepping through the Preorders date picker day by day.
//
// Money totals that already exist elsewhere are imported, not recomputed:
//  - net cash per account  → lib/accountBalances.ts (shared with Accounts page)
//  - vendor owed / paid    → lib/preorderVendorLedger.ts (shared with Preorders)
// Revenue/COGS/profit are deliberately NOT recomputed here — Reports → Profit
// & COGS is the single source of truth for those, and a second derivation that
// disagreed with it by a few dollars would be worse than no second view.
// ─────────────────────────────────────────────────────────────────────────────

// Local calendar date as "YYYY-MM-DD". Never `.toISOString().slice(0,10)` —
// that reads the UTC date, which silently rolls "today" to tomorrow for anyone
// west of UTC in the evening (CLAUDE.md gotcha #19).
export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Outstanding student balances ────────────────────────────────────────────

export interface OutstandingBalanceRow {
  id: string
  bochurId: string | null
  name: string
  grade: string | null
  phone: string | null
  accountTypeName: string | null
  balance: number
  archived: boolean
  isFrozen: boolean
  /** ISO timestamp of their most recent completed order, or null if never. */
  lastOrderAt: string | null
}

export interface OutstandingBalances {
  rows: OutstandingBalanceRow[]
  /** Money the canteen is holding on behalf of students (sum of positives). */
  owedToStudents: number
  /** Money students owe the canteen (sum of negatives, as a positive number). */
  owedByStudents: number
  /** True when the last-order lookup hit its page cap and may be incomplete. */
  lastOrderTruncated: boolean
  error?: string
}

// PostgREST caps a single response at 1000 rows, so "when did each student last
// buy something" can't be a one-shot select over all orders — it silently
// truncates and every student past the cap reads as "never ordered". Page
// through instead, newest first: because rows arrive in descending created_at
// order, the FIRST time a bochur_id appears is their most recent order.
const ORDER_PAGE_SIZE = 1000
const MAX_ORDER_PAGES = 40 // 40k orders — far beyond a single camp season

async function fetchLastOrderMap(
  supabase: SupabaseClient
): Promise<{ map: Map<string, string>; truncated: boolean; error?: string }> {
  const map = new Map<string, string>()
  for (let page = 0; page < MAX_ORDER_PAGES; page++) {
    const { data, error } = await supabase
      .from('orders')
      .select('bochur_id, created_at')
      .eq('status', 'completed')
      .not('bochur_id', 'is', null)
      .order('created_at', { ascending: false })
      .range(page * ORDER_PAGE_SIZE, (page + 1) * ORDER_PAGE_SIZE - 1)
    if (error) {
      console.error('seasonClose: last-order lookup failed', error)
      return { map, truncated: true, error: 'Could not load last-purchase dates' }
    }
    for (const o of (data || []) as any[]) {
      if (!map.has(o.bochur_id)) map.set(o.bochur_id, o.created_at)
    }
    if (!data || data.length < ORDER_PAGE_SIZE) return { map, truncated: false }
  }
  return { map, truncated: true }
}

/**
 * Every student account carrying a non-zero balance — including archived ones,
 * which are the easiest to forget about at season's end precisely because they
 * no longer show up anywhere in the normal Students list.
 */
export async function fetchOutstandingBalances(supabase: SupabaseClient): Promise<OutstandingBalances> {
  const [{ data: bochurim, error: bErr }, { data: accountTypes }, lastOrder] = await Promise.all([
    supabase
      .from('bochurim_with_id')
      .select('id, bochur_id, name, grade, phone, balance, account_type_id, archived, is_frozen')
      .neq('balance', 0)
      .order('balance', { ascending: false }),
    supabase.from('account_types').select('id, name'),
    fetchLastOrderMap(supabase),
  ])

  if (bErr) console.error('seasonClose: outstanding balances query failed', bErr)

  const typeName = new Map((accountTypes || []).map((t: any) => [t.id, t.name as string]))

  const rows: OutstandingBalanceRow[] = ((bochurim || []) as any[]).map(b => ({
    id: b.id,
    bochurId: b.bochur_id ?? null,
    name: b.name,
    grade: b.grade ?? null,
    phone: b.phone ?? null,
    accountTypeName: typeName.get(b.account_type_id) ?? null,
    balance: Number(b.balance),
    archived: !!b.archived,
    isFrozen: !!b.is_frozen,
    lastOrderAt: lastOrder.map.get(b.id) ?? null,
  }))

  let owedToStudents = 0
  let owedByStudents = 0
  for (const r of rows) {
    if (r.balance > 0) owedToStudents += r.balance
    else owedByStudents += Math.abs(r.balance)
  }

  return {
    rows,
    owedToStudents: Math.round(owedToStudents * 100) / 100,
    owedByStudents: Math.round(owedByStudents * 100) / 100,
    lastOrderTruncated: lastOrder.truncated,
    error: bErr ? 'Could not load student balances — this list is incomplete' : lastOrder.error,
  }
}

// ─── Leftover inventory valuation ────────────────────────────────────────────

export interface InventoryValuationRow {
  productId: string
  name: string
  icon: string | null
  isActive: boolean
  /** Total units left across the product (or summed across its variants). */
  units: number
  /** Sum of units × cost. Uses each variant's own cost when it has one. */
  costValue: number
  /** Sum of units × sell price — what it would be worth if it all sold. */
  retailValue: number
  hasVariants: boolean
  /** Per-variant breakdown, empty for a plain product. */
  variants: { label: string; units: number; costValue: number; retailValue: number }[]
}

export interface InventoryValuation {
  rows: InventoryValuationRow[]
  totalCostValue: number
  totalRetailValue: number
  totalUnits: number
  /**
   * Products whose stock is deliberately untracked (`stock_quantity` NULL =
   * unlimited, see CLAUDE.md gotcha #2). They can't be valued, so the totals
   * above are a floor, not a complete count — surfaced so nobody reads the
   * number as "this is definitely all the stock we have left".
   */
  untrackedProductNames: string[]
  /** Products with leftover units but no cost price set — they contribute $0
   *  to the cost total, silently under-reporting it. Same failure mode as the
   *  vendor ledger's blank-cost gap (CLAUDE.md gotcha #43). */
  missingCostProductNames: string[]
  error?: string
}

export async function fetchInventoryValuation(supabase: SupabaseClient): Promise<InventoryValuation> {
  const [{ data: products, error: pErr }, { data: variants, error: vErr }] = await Promise.all([
    supabase.from('products').select('id, name, icon, price, cost_price, stock_quantity, has_variants, is_active').order('name'),
    supabase.from('product_variants').select('product_id, label, price, cost_price, stock_quantity, is_active'),
  ])
  if (pErr) console.error('seasonClose: products query failed', pErr)
  if (vErr) console.error('seasonClose: variants query failed', vErr)

  const variantsByProduct = new Map<string, any[]>()
  for (const v of (variants || []) as any[]) {
    const list = variantsByProduct.get(v.product_id) || []
    list.push(v)
    variantsByProduct.set(v.product_id, list)
  }

  const rows: InventoryValuationRow[] = []
  const untrackedProductNames: string[] = []
  const missingCostProductNames: string[] = []

  for (const p of (products || []) as any[]) {
    const productCost = p.cost_price == null ? null : Number(p.cost_price)
    const productPrice = Number(p.price ?? 0)

    if (p.has_variants) {
      // Real stock lives on the variants, never on the parent product row
      // (CLAUDE.md gotcha #2) — value each variant with its own cost/price,
      // falling back to the product's when the variant leaves them blank.
      const vs = (variantsByProduct.get(p.id) || []).filter(v => v.stock_quantity != null && Number(v.stock_quantity) > 0)
      if (vs.length === 0) {
        const anyUntracked = (variantsByProduct.get(p.id) || []).some(v => v.stock_quantity == null)
        if (anyUntracked) untrackedProductNames.push(p.name)
        continue
      }
      const breakdown = vs.map(v => {
        const units = Number(v.stock_quantity)
        const cost = v.cost_price == null ? productCost : Number(v.cost_price)
        const price = v.price == null ? productPrice : Number(v.price)
        return {
          label: v.label as string,
          units,
          costValue: Math.round(units * (cost ?? 0) * 100) / 100,
          retailValue: Math.round(units * price * 100) / 100,
        }
      })
      const units = breakdown.reduce((s, b) => s + b.units, 0)
      const costValue = Math.round(breakdown.reduce((s, b) => s + b.costValue, 0) * 100) / 100
      const retailValue = Math.round(breakdown.reduce((s, b) => s + b.retailValue, 0) * 100) / 100
      if (costValue === 0 && units > 0) missingCostProductNames.push(p.name)
      rows.push({
        productId: p.id, name: p.name, icon: p.icon ?? null, isActive: !!p.is_active,
        units, costValue, retailValue, hasVariants: true, variants: breakdown,
      })
      continue
    }

    if (p.stock_quantity == null) {
      untrackedProductNames.push(p.name)
      continue
    }
    const units = Number(p.stock_quantity)
    if (units <= 0) continue
    const costValue = Math.round(units * (productCost ?? 0) * 100) / 100
    if (productCost == null || productCost === 0) missingCostProductNames.push(p.name)
    rows.push({
      productId: p.id, name: p.name, icon: p.icon ?? null, isActive: !!p.is_active,
      units,
      costValue,
      retailValue: Math.round(units * productPrice * 100) / 100,
      hasVariants: false, variants: [],
    })
  }

  rows.sort((a, b) => b.costValue - a.costValue || b.units - a.units)

  return {
    rows,
    totalCostValue: Math.round(rows.reduce((s, r) => s + r.costValue, 0) * 100) / 100,
    totalRetailValue: Math.round(rows.reduce((s, r) => s + r.retailValue, 0) * 100) / 100,
    totalUnits: rows.reduce((s, r) => s + r.units, 0),
    untrackedProductNames,
    missingCostProductNames,
    error: (pErr || vErr) ? 'Some inventory data failed to load — these values are incomplete' : undefined,
  }
}

// ─── Loose ends (anything still unresolved, across all dates) ────────────────

export interface PendingPreorderRow {
  id: string
  forDate: string
  bochurName: string
  total: number
  placedVia: 'pos' | 'public_link'
  sentToVendor: boolean
  isStaffPricing: boolean
  itemSummary: string
  /** for_date is before today — ordered but never handed over or cancelled. */
  isStale: boolean
}

export interface LooseEnds {
  /** Every still-pending preorder across ALL dates, oldest first. The
   *  Preorders → Orders tab can only ever show one date at a time, so a
   *  forgotten order from three weeks ago is otherwise invisible. */
  pendingPreorders: PendingPreorderRow[]
  stalePreorderCount: number
  pendingPreorderTotal: number

  pendingTopupCount: number
  pendingTopupTotal: number

  pendingRefundRequestCount: number
  pendingRefundRequestTotal: number

  unconfirmedWithdrawalCount: number
  unconfirmedWithdrawalTotal: number

  /** Cashiers whose accumulated tips were never paid out — real money owed to
   *  staff that lives nowhere else but `cashier_profiles.tip_balance`, and has
   *  no queue or badge anywhere prompting anyone to settle it. */
  unpaidTips: { id: string; name: string; amount: number }[]
  unpaidTipsTotal: number

  error?: string
}

export async function fetchLooseEnds(supabase: SupabaseClient): Promise<LooseEnds> {
  // Camp-local "today", not the browser's — a preorder's for_date is a camp
  // calendar date, and the Preorders hub decides "today" the same way
  // (lib/preorderCutoff.ts, America/New_York). Using the browser's date here
  // would make an order flip in and out of "past-dated" depending on who's
  // looking and from where.
  const today = localDateStrInTz(new Date())

  const [
    { data: preorders, error: poErr },
    { data: topups, error: tErr },
    { data: refundReqs, error: rErr },
    { data: withdrawals, error: wErr },
    { data: tipRows, error: tipErr },
  ] = await Promise.all([
    supabase
      .from('preorders')
      .select('id, for_date, total_amount, placed_via, sent_to_vendor, is_staff_pricing, bochurim!bochur_id(name), preorder_items(product_name, quantity, is_bundle_component)')
      .eq('status', 'pending')
      .order('for_date', { ascending: true }),
    supabase.from('balance_topups').select('amount').eq('status', 'pending'),
    supabase.from('refund_requests').select('amount').eq('status', 'pending'),
    supabase.from('withdrawal_log').select('amount').eq('confirmed_received', false),
    supabase.from('cashier_profiles').select('id, name, tip_balance').gt('tip_balance', 0),
  ])

  if (poErr) console.error('seasonClose: pending preorders query failed', poErr)

  const pendingPreorders: PendingPreorderRow[] = ((preorders || []) as any[]).map(p => ({
    id: p.id,
    forDate: p.for_date,
    bochurName: p.bochurim?.name || 'Unknown',
    total: Number(p.total_amount ?? 0),
    placedVia: p.placed_via,
    sentToVendor: !!p.sent_to_vendor,
    isStaffPricing: !!p.is_staff_pricing,
    // Bundle-component rows are $0 rollup rows, not real line items — same
    // display rule as order_items (CLAUDE.md gotcha #22 / #46).
    itemSummary: (p.preorder_items || [])
      .filter((i: any) => !i.is_bundle_component)
      .map((i: any) => `${i.product_name} ×${i.quantity}`)
      .join(', '),
    isStale: String(p.for_date) < today,
  }))

  const sum = (rows: any[] | null, key = 'amount') =>
    Math.round((rows || []).reduce((s: number, r: any) => s + Number(r[key] ?? 0), 0) * 100) / 100

  const unpaidTips = ((tipRows || []) as any[])
    .map(c => ({ id: c.id as string, name: (c.name as string) || 'Cashier', amount: Number(c.tip_balance ?? 0) }))
    .filter(t => t.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  const firstErr = poErr || tErr || rErr || wErr || tipErr

  return {
    pendingPreorders,
    stalePreorderCount: pendingPreorders.filter(p => p.isStale).length,
    pendingPreorderTotal: Math.round(pendingPreorders.reduce((s, p) => s + p.total, 0) * 100) / 100,

    pendingTopupCount: (topups || []).length,
    pendingTopupTotal: sum(topups),

    pendingRefundRequestCount: (refundReqs || []).length,
    pendingRefundRequestTotal: sum(refundReqs),

    unconfirmedWithdrawalCount: (withdrawals || []).length,
    unconfirmedWithdrawalTotal: sum(withdrawals),

    unpaidTips,
    unpaidTipsTotal: Math.round(unpaidTips.reduce((s, t) => s + t.amount, 0) * 100) / 100,

    error: firstErr ? 'Some loose-end data failed to load — the counts below may be incomplete' : undefined,
  }
}

// ─── CSV helpers ─────────────────────────────────────────────────────────────

export function csvEscape(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvLine(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvEscape).join(',')
}

export function downloadCSV(filename: string, lines: string[]) {
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
