import type { SupabaseClient } from '@supabase/supabase-js'

// Maps a Net Account Balance key (cash/zelle/stripe/venmo/paypal/cashapp) to
// every raw `method` value across payments/balance_topups/balance_ledger that
// contributes to it — mirrors the bucketing in accounts/page.tsx's
// loadNetBalances() exactly, so this always matches the card totals.
const PAYMENT_METHODS: Record<string, string[]> = {
  cash: ['cash'],
  stripe: ['credit_card', 'card', 'stripe_terminal'],
  zelle: [], venmo: [], paypal: [], cashapp: [],
}
const TOPUP_METHODS: Record<string, string[]> = {
  cash: ['cash'], zelle: ['zelle'], stripe: ['credit_card', 'card'],
  venmo: ['venmo'], paypal: ['paypal'], cashapp: ['cashapp'],
}
const LEDGER_TOPUP_METHODS: Record<string, string[]> = {
  cash: ['cash_change', 'cash'], zelle: ['zelle'], venmo: ['venmo'], paypal: ['paypal'],
  stripe: [], cashapp: [],
}
const LEDGER_REFUND_METHODS: Record<string, string[]> = {
  cash: ['cash'], zelle: ['zelle'], stripe: ['cc'],
  venmo: [], paypal: [], cashapp: [],
}

export const ACCOUNT_KEYS = ['cash', 'zelle', 'stripe', 'venmo', 'paypal', 'cashapp']

export interface AccountTxn {
  id: string
  date: string // ISO timestamp
  account: string
  kind: 'sale' | 'topup' | 'cash_change' | 'add_funds' | 'refund_out' | 'withdrawal_out'
  amount: number // signed: + in, - out
  who: string
  detail: string
  reason?: string | null
  confirmed?: boolean
  confirmationMethod?: string | null
}

export const KIND_LABELS: Record<AccountTxn['kind'], string> = {
  sale: 'POS Sale',
  topup: 'Parent Top-up',
  cash_change: 'Cash Kept as Change',
  add_funds: 'Add Funds',
  refund_out: 'Refund Paid',
  withdrawal_out: 'Withdrawal',
}

export async function fetchAccountTransactions(supabase: SupabaseClient, accountKey: string): Promise<AccountTxn[]> {
  const results: AccountTxn[] = []

  const payMethods = PAYMENT_METHODS[accountKey] || []
  const topupMethods = TOPUP_METHODS[accountKey] || []
  const ledgerTopupMethods = LEDGER_TOPUP_METHODS[accountKey] || []
  const ledgerRefundMethods = LEDGER_REFUND_METHODS[accountKey] || []

  const [
    { data: payments },
    { data: topups },
    { data: ledgerTopups },
    { data: ledgerRefunds },
    { data: withdrawals },
  ] = await Promise.all([
    payMethods.length
      ? supabase.from('payments').select('id, amount, created_at, order_id').in('method', payMethods)
      : Promise.resolve({ data: [] as any[] }),
    topupMethods.length
      ? supabase.from('balance_topups').select('id, amount, confirmed_at, payment_received_date, student_name, sender_name')
          .eq('status', 'confirmed').in('method', topupMethods)
      : Promise.resolve({ data: [] as any[] }),
    ledgerTopupMethods.length
      ? supabase.from('balance_ledger').select('id, method, amount, created_at, bochur_id, note')
          .eq('type', 'topup').in('method', ledgerTopupMethods)
      : Promise.resolve({ data: [] as any[] }),
    ledgerRefundMethods.length
      ? supabase.from('balance_ledger').select('id, amount, created_at, bochur_id, note')
          .eq('type', 'refund').in('method', ledgerRefundMethods)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('withdrawal_log')
      .select('id, amount, date, reason, note, paid_to, confirmed_received, confirmation_method')
      .eq('account', accountKey),
  ])

  // Resolve bochur names in two hops: payments -> orders -> bochur_id, then
  // bochur_id -> name for everything (payments' orders + both ledger sources).
  const orderIds = Array.from(new Set((payments || []).map((p: any) => p.order_id).filter(Boolean)))
  const { data: orders } = orderIds.length
    ? await supabase.from('orders').select('id, bochur_id').in('id', orderIds)
    : { data: [] as any[] }
  const orderToBochur = new Map((orders || []).map((o: any) => [o.id, o.bochur_id]))

  const bochurIds = Array.from(new Set([
    ...(orders || []).map((o: any) => o.bochur_id),
    ...(ledgerTopups || []).map((l: any) => l.bochur_id),
    ...(ledgerRefunds || []).map((l: any) => l.bochur_id),
  ].filter(Boolean)))
  const { data: bochurim } = bochurIds.length
    ? await supabase.from('bochurim').select('id, name').in('id', bochurIds)
    : { data: [] as any[] }
  const bochurName = new Map((bochurim || []).map((b: any) => [b.id, b.name]))

  for (const p of (payments || []) as any[]) {
    const bochurId = orderToBochur.get(p.order_id)
    results.push({
      id: `pay-${p.id}`,
      date: p.created_at,
      account: accountKey,
      kind: 'sale',
      amount: Number(p.amount),
      who: bochurId ? (bochurName.get(bochurId) || 'Student') : 'Walk-in',
      detail: 'POS checkout',
    })
  }

  for (const t of (topups || []) as any[]) {
    const date = t.payment_received_date || t.confirmed_at
    results.push({
      id: `topup-${t.id}`,
      date,
      account: accountKey,
      kind: 'topup',
      amount: Number(t.amount),
      who: t.student_name || 'Student',
      detail: t.sender_name ? `From ${t.sender_name}` : 'Parent top-up',
    })
  }

  for (const l of (ledgerTopups || []) as any[]) {
    results.push({
      id: `ledger-topup-${l.id}`,
      date: l.created_at,
      account: accountKey,
      kind: l.method === 'cash_change' ? 'cash_change' : 'add_funds',
      amount: Number(l.amount),
      who: bochurName.get(l.bochur_id) || 'Student',
      detail: l.note || '',
    })
  }

  for (const l of (ledgerRefunds || []) as any[]) {
    results.push({
      id: `ledger-refund-${l.id}`,
      date: l.created_at,
      account: accountKey,
      kind: 'refund_out',
      amount: -Math.abs(Number(l.amount)),
      who: bochurName.get(l.bochur_id) || 'Student',
      detail: l.note || 'Balance refund',
    })
  }

  for (const w of (withdrawals || []) as any[]) {
    results.push({
      id: `withdrawal-${w.id}`,
      date: w.date,
      account: accountKey,
      kind: 'withdrawal_out',
      amount: -Math.abs(Number(w.amount)),
      who: w.paid_to || 'Unspecified',
      detail: w.note || w.reason || 'Withdrawal',
      reason: w.reason,
      confirmed: w.confirmed_received,
      confirmationMethod: w.confirmation_method,
    })
  }

  results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return results
}
