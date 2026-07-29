import type { SupabaseClient } from '@supabase/supabase-js'

// "What should actually be sitting in each account right now" — all-time money
// in minus all-time money out, per payment account.
//
// This lives in a lib (rather than inline in accounts/page.tsx, where it was
// originally written) so the Accounts page and the Season Close summary can
// never disagree about the same number. Two admin screens showing different
// cash positions is worse than having no second screen at all.
//
// See CLAUDE.md gotcha #27 for WHY balance_ledger has to be read here and not
// just payments + balance_topups: several real money movements (cash kept as
// change, tagged Add Funds entries, refunds paid back out to a student) only
// ever land in the ledger, and were invisible to Accounts until they were
// explicitly netted in.

export const ACCOUNT_ORDER = ['cash', 'zelle', 'stripe', 'venmo', 'paypal', 'cashapp']

export const ACCOUNT_LABELS: Record<string, string> = {
  zelle: 'Zelle',
  stripe: 'Credit Card',
  cash: 'Cash',
  venmo: 'Venmo',
  paypal: 'PayPal',
  cashapp: 'Cash App',
}

export interface NetAccountBalances {
  received: Record<string, number>
  withdrawn: Record<string, number>
  /** Set when any underlying query failed — callers should surface it rather
   *  than silently rendering an under-reported cash position. */
  error?: string
}

export async function computeNetAccountBalances(supabase: SupabaseClient): Promise<NetAccountBalances> {
  const [
    { data: payments, error: payErr },
    { data: topups, error: topupErr },
    { data: allWithdrawals, error: wdErr },
    { data: ledgerRows, error: ledgerErr },
  ] = await Promise.all([
    supabase.from('payments').select('method, amount'),
    supabase.from('balance_topups').select('method, amount').eq('status', 'confirmed'),
    supabase.from('withdrawal_log').select('account, amount'),
    // Only rows that carry a `method` are relevant here — topup-confirm's and
    // cashier auto-approve's ledger side-effects deliberately leave method
    // null (their money is already counted via balance_topups above), so
    // this can never double-count those. What's left is real money that
    // never touches `payments`/`balance_topups` at all:
    //  - type=topup, method=cash_change: cash kept in the drawer instead of
    //    handed back as change (checkout route)
    //  - type=topup, method=cash/zelle/venmo/paypal: Add Funds entries
    //    tagged with a real payment method (method=manual/other_internal
    //    intentionally excluded — unspecified or explicitly no real money)
    //  - type=refund, method=cash/zelle/cc: money paid back out of that
    //    account to a student (bochur profile refund flow)
    supabase.from('balance_ledger').select('type, method, amount').in('type', ['topup', 'refund']).not('method', 'is', null),
  ])

  const received: Record<string, number> = { cash: 0, zelle: 0, stripe: 0, venmo: 0, paypal: 0, cashapp: 0 }
  for (const p of (payments || []) as any[]) {
    const amt = Number(p.amount)
    if (p.method === 'cash') received.cash += amt
    else if (p.method === 'zelle') received.zelle += amt
    else if (p.method === 'credit_card' || p.method === 'card' || p.method === 'stripe_terminal') received.stripe += amt
  }
  for (const t of (topups || []) as any[]) {
    const amt = Number(t.amount)
    if (t.method === 'cash') received.cash += amt
    else if (t.method === 'zelle') received.zelle += amt
    else if (t.method === 'credit_card' || t.method === 'card') received.stripe += amt
    else if (t.method === 'venmo') received.venmo += amt
    else if (t.method === 'paypal') received.paypal += amt
    else if (t.method === 'cashapp') received.cashapp += amt
  }

  const withdrawn: Record<string, number> = {}
  for (const w of (allWithdrawals || []) as any[]) {
    withdrawn[w.account] = (withdrawn[w.account] || 0) + Number(w.amount)
  }

  for (const l of (ledgerRows || []) as any[]) {
    const amt = Math.abs(Number(l.amount))
    if (l.type === 'topup') {
      if (l.method === 'cash_change' || l.method === 'cash') received.cash += amt
      else if (l.method === 'zelle') received.zelle += amt
      else if (l.method === 'venmo') received.venmo += amt
      else if (l.method === 'paypal') received.paypal += amt
      // method === 'manual' or 'other_internal': intentionally not counted
    } else if (l.type === 'refund') {
      if (l.method === 'cash') withdrawn.cash = (withdrawn.cash || 0) + amt
      else if (l.method === 'zelle') withdrawn.zelle = (withdrawn.zelle || 0) + amt
      else if (l.method === 'cc') withdrawn.stripe = (withdrawn.stripe || 0) + amt
      // method === 'void': balance-only reversal, no real account affected
    }
  }

  const firstErr = payErr || topupErr || wdErr || ledgerErr
  if (firstErr) console.error('computeNetAccountBalances: a query failed, totals may be incomplete', firstErr)

  return {
    received,
    withdrawn,
    error: firstErr ? 'Some account data failed to load — the balances below may be incomplete' : undefined,
  }
}
