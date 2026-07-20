'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { X, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { format } from 'date-fns'

// Maps a Net Account Balance key (cash/zelle/stripe/venmo/paypal/cashapp) to
// every raw `method` value across payments/balance_topups/balance_ledger that
// contributes to it — mirrors the bucketing in accounts/page.tsx's
// loadNetBalances() exactly, so the drill-down always matches the card total.
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

interface Txn {
  id: string
  date: string // ISO timestamp
  kind: 'sale' | 'topup' | 'cash_change' | 'add_funds' | 'refund_out' | 'withdrawal_out'
  amount: number // signed: + in, - out
  who: string
  detail: string
}

const KIND_LABELS: Record<Txn['kind'], string> = {
  sale: 'POS Sale',
  topup: 'Parent Top-up',
  cash_change: 'Cash Kept as Change',
  add_funds: 'Add Funds',
  refund_out: 'Refund Paid',
  withdrawal_out: 'Withdrawal',
}

export default function AccountTransactionsModal({
  accountKey, accountLabel, onClose,
}: { accountKey: string; accountLabel: string; onClose: () => void }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [txns, setTxns] = useState<Txn[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  useEffect(() => { load() }, [accountKey])

  async function load() {
    setLoading(true)
    const results: Txn[] = []

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
      supabase.from('withdrawal_log').select('id, amount, date, reason, note, paid_to').eq('account', accountKey),
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
        kind: 'withdrawal_out',
        amount: -Math.abs(Number(w.amount)),
        who: w.paid_to || 'Unspecified',
        detail: w.note || w.reason || 'Withdrawal',
      })
    }

    results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    setTxns(results)
    setLoading(false)
  }

  const filtered = txns.filter(t => {
    const d = t.date.slice(0, 10)
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  })
  const totalIn = filtered.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const totalOut = filtered.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-lg">{accountLabel} — Transaction History</h3>
            <p className="text-xs text-slate-400 mt-0.5">Every recorded movement in or out of this account</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500">To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1 text-sm" />
          </div>
          {(from || to) && (
            <button onClick={() => { setFrom(''); setTo('') }} className="text-xs text-slate-400 hover:text-slate-600">
              Clear (show all-time)
            </button>
          )}
          <div className="ml-auto flex items-center gap-4 text-sm">
            <span className="text-emerald-600 font-semibold">{formatCurrency(totalIn)} in</span>
            <span className="text-red-500 font-semibold">{formatCurrency(Math.abs(totalOut))} out</span>
            <span className="font-bold text-slate-800">{formatCurrency(totalIn + totalOut)} net</span>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">No transactions for this account{(from || to) ? ' in this range' : ''}.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Who</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Detail</th>
                  <th className="text-right px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{format(new Date(t.date), 'MMM d, yyyy')}</td>
                    <td className="px-5 py-3 text-slate-700 whitespace-nowrap">{KIND_LABELS[t.kind]}</td>
                    <td className="px-5 py-3 text-slate-700 whitespace-nowrap">{t.who}</td>
                    <td className="px-5 py-3 text-slate-500 max-w-xs truncate">{t.detail || <span className="text-slate-300">—</span>}</td>
                    <td className={`px-5 py-3 text-right font-semibold whitespace-nowrap ${t.amount < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      <span className="inline-flex items-center gap-1 justify-end">
                        {t.amount < 0 ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                        {formatCurrency(Math.abs(t.amount))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
