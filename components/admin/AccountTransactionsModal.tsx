'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { X, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { format } from 'date-fns'
import { fetchAccountTransactions, KIND_LABELS, type AccountTxn } from '@/lib/accountTransactions'

export default function AccountTransactionsModal({
  accountKey, accountLabel, onClose,
}: { accountKey: string; accountLabel: string; onClose: () => void }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [txns, setTxns] = useState<AccountTxn[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  useEffect(() => { load() }, [accountKey])

  async function load() {
    setLoading(true)
    setTxns(await fetchAccountTransactions(supabase, accountKey))
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
