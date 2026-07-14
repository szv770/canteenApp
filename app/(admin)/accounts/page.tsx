'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Wallet, Plus, Trash2, RefreshCw, DollarSign, CreditCard, Smartphone, Banknote, Users } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

// Local calendar date as "YYYY-MM-DD" — `.toISOString().slice(0,10)` reads the UTC
// date instead, which silently rolls "today" over to tomorrow for anyone west of
// UTC once local time passes UTC midnight (e.g. any US timezone, evening hours).
function fmtLocalDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const todayStr = () => fmtLocalDate(new Date())

interface WithdrawalRow {
  id: string
  account: string
  amount: number
  date: string
  note: string | null
  created_at: string
}

const ACCOUNT_LABELS: Record<string, string> = {
  zelle: 'Zelle',
  stripe: 'Stripe / CC',
  cash: 'Cash',
}

export default function AccountsPage() {
  const supabase = createClient()

  // ── Date range ──────────────────────────────────────────────────────────
  const [from, setFrom] = useState(todayStr())
  const [to, setTo] = useState(todayStr())

  // ── Payment balances ─────────────────────────────────────────────────────
  const [paymentMap, setPaymentMap] = useState<Record<string, number>>({})
  const [bochurBalance, setBochurBalance] = useState<number>(0)
  const [loadingPayments, setLoadingPayments] = useState(false)

  // ── Top-up deposit totals ─────────────────────────────────────────────────
  const [topupByMethod, setTopupByMethod] = useState<Record<string, number>>({})

  // ── Withdrawal log ───────────────────────────────────────────────────────
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([])
  const [loadingLog, setLoadingLog] = useState(false)

  // ── New withdrawal form ──────────────────────────────────────────────────
  const [fAccount, setFAccount] = useState<'zelle' | 'stripe' | 'cash'>('cash')
  const [fAmount, setFAmount] = useState('')
  const [fDate, setFDate] = useState(todayStr())
  const [fNote, setFNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadPayments() }, [from, to])
  useEffect(() => { loadWithdrawals() }, [])

  async function loadPayments() {
    setLoadingPayments(true)
    // from/to are local "YYYY-MM-DD" strings (from <input type="date"> and the
    // quick-filter buttons below) — build boundaries from local time components,
    // not by tacking a literal 'Z' (UTC) onto a local calendar date.
    const [fy, fm, fd] = from.split('-').map(Number)
    const [ty, tm, td] = to.split('-').map(Number)
    const fromISO = new Date(fy, fm - 1, fd).toISOString()
    const toISO = new Date(ty, tm - 1, td + 1).toISOString() // exclusive: start of the day after `to`

    const [{ data: payments }, { data: bochurim }, { data: allTopups }] = await Promise.all([
      supabase.from('payments').select('method, amount').gte('created_at', fromISO).lt('created_at', toISO),
      supabase.from('bochurim').select('balance').eq('archived', false),
      // Fetch all confirmed topups to filter client-side using payment_received_date (fallback: confirmed_at)
      supabase
        .from('balance_topups')
        .select('method, amount, payment_received_date, confirmed_at')
        .eq('status', 'confirmed'),
    ])

    const map: Record<string, number> = {}
    for (const p of payments || []) {
      map[p.method] = (map[p.method] || 0) + Number(p.amount)
    }
    setPaymentMap(map)

    const total = (bochurim || []).reduce((s: number, b: any) => s + Number(b.balance || 0), 0)
    setBochurBalance(total)

    // Group top-up deposits by method, filtering by payment_received_date (fallback: confirmed_at date)
    const topupMap: Record<string, number> = {}
    for (const t of (allTopups || []) as any[]) {
      const dateToUse: string = t.payment_received_date || (t.confirmed_at ? t.confirmed_at.slice(0, 10) : null)
      if (!dateToUse || dateToUse < from || dateToUse > to) continue
      const method = t.method || 'unknown'
      topupMap[method] = (topupMap[method] || 0) + Number(t.amount)
    }
    setTopupByMethod(topupMap)

    setLoadingPayments(false)
  }

  async function loadWithdrawals() {
    setLoadingLog(true)
    const { data, error } = await supabase
      .from('withdrawal_log')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) toast.error('Failed to load withdrawal log')
    setWithdrawals(data || [])
    setLoadingLog(false)
  }

  async function addWithdrawal(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(fAmount)
    if (!fAmount || isNaN(amt) || amt <= 0) { toast.error('Enter a valid amount'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('withdrawal_log').insert({
      account: fAccount,
      amount: amt,
      date: fDate,
      note: fNote.trim() || null,
      recorded_by: user?.id ?? null,
    })
    if (error) { toast.error('Failed to save: ' + error.message); setSaving(false); return }
    toast.success('Withdrawal logged')
    setFAmount('')
    setFNote('')
    setFDate(todayStr())
    setSaving(false)
    loadWithdrawals()
  }

  async function deleteWithdrawal(id: string) {
    if (!confirm('Delete this withdrawal record?')) return
    const { error } = await supabase.from('withdrawal_log').delete().eq('id', id)
    if (error) { toast.error('Delete failed: ' + error.message); return }
    toast.success('Deleted')
    setWithdrawals(prev => prev.filter(w => w.id !== id))
  }

  // Which quick-filter (if any) matches the currently loaded range — drives the
  // active/highlighted button style below (previously "Today" was hardcoded green
  // regardless of the actual range shown).
  const isTodayRange = from === todayStr() && to === todayStr()
  const last7From = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return fmtLocalDate(d) })()
  const isLast7Range = from === last7From && to === todayStr()
  const last30From = (() => { const d = new Date(); d.setDate(d.getDate() - 29); return fmtLocalDate(d) })()
  const isLast30Range = from === last30From && to === todayStr()

  // Aggregated totals — top-up deposits (parent-facing payments that fund a
  // student's balance) are real money physically received just like a register
  // payment, so they roll into the same headline Cash/Zelle/Credit Card buckets
  // instead of being tracked only in the separate "Top-up Deposits" section below.
  const topupCash = topupByMethod['cash'] || 0
  const topupZelle = topupByMethod['zelle'] || 0
  const topupCC = (topupByMethod['credit_card'] || 0) + (topupByMethod['card'] || 0)
  const topupOther = Object.entries(topupByMethod)
    .filter(([k]) => !['cash', 'zelle', 'credit_card', 'card'].includes(k))
    .reduce((s, [, v]) => s + v, 0)

  const cash = (paymentMap['cash'] || 0) + topupCash
  const zelle = (paymentMap['zelle'] || 0) + topupZelle
  const cc = (paymentMap['credit_card'] || 0) + (paymentMap['card'] || 0) + topupCC
  const balance = paymentMap['balance'] || 0
  const other = Object.entries(paymentMap)
    .filter(([k]) => !['cash', 'zelle', 'credit_card', 'card', 'balance'].includes(k))
    .reduce((s, [, v]) => s + v, 0) + topupOther
  const grandTotal = cash + zelle + cc + balance + other

  const PayCard = ({
    label, amount, icon: Icon, color,
  }: { label: string; amount: number; icon: React.ElementType; color: string }) => (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-slate-800 mt-0.5">{formatCurrency(amount)}</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-sm">
          <Wallet className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Accounts</h1>
          <p className="text-sm text-slate-500">Payment balances & withdrawal tracking</p>
        </div>
      </div>

      {/* ── Section 1: Payment Account Balances ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-700">Payment Account Balances</h2>
          <button
            onClick={loadPayments}
            disabled={loadingPayments}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loadingPayments ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Date range picker */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600 whitespace-nowrap">From</label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600 whitespace-nowrap">To</label>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            onClick={() => { setFrom(todayStr()); setTo(todayStr()) }}
            className={`text-sm font-medium ${isTodayRange ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Today
          </button>
          <button
            onClick={() => {
              const d = new Date(); d.setDate(d.getDate() - 6)
              setFrom(fmtLocalDate(d)); setTo(todayStr())
            }}
            className={`text-sm font-medium ${isLast7Range ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Last 7 days
          </button>
          <button
            onClick={() => {
              const d = new Date(); d.setDate(d.getDate() - 29)
              setFrom(fmtLocalDate(d)); setTo(todayStr())
            }}
            className={`text-sm font-medium ${isLast30Range ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Last 30 days
          </button>
        </div>

        {/* Balance cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <PayCard label="Cash" amount={cash} icon={Banknote} color="bg-green-500" />
          <PayCard label="Zelle" amount={zelle} icon={Smartphone} color="bg-purple-500" />
          <PayCard label="Credit Card" amount={cc} icon={CreditCard} color="bg-blue-500" />
          <PayCard label="Balance" amount={balance} icon={DollarSign} color="bg-amber-500" />
          <PayCard label="Total" amount={grandTotal} icon={Wallet} color="bg-slate-700" />
        </div>

        {/* Outstanding bochur balance (liability) */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-rose-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-600">Outstanding Balance <span className="text-slate-400 font-normal">(owed to students)</span></p>
            <p className="text-2xl font-bold text-rose-600 mt-0.5">{formatCurrency(bochurBalance)}</p>
          </div>
          <p className="text-xs text-slate-400 max-w-[200px] text-right hidden sm:block">
            Sum of all active student account balances — represents money the canteen holds on behalf of students.
          </p>
        </div>
      </section>

      {/* ── Section 1b: Top-up Deposits Received ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-700">Top-up Deposits Received</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Parent payments confirmed in the selected date range, grouped by method.
            Uses the &ldquo;Date Received&rdquo; field set at confirmation (falls back to confirmation date if not set).
            Already included in the Cash/Zelle/Credit Card balances above — shown here as a breakdown, not an addition.
          </p>
        </div>

        {loadingPayments ? (
          <div className="text-sm text-slate-400">Loading…</div>
        ) : Object.keys(topupByMethod).length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 text-sm text-slate-400 text-center">
            No confirmed top-ups in this date range.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.entries(topupByMethod)
              .sort(([, a], [, b]) => b - a)
              .map(([method, amount]) => {
                const label = method.charAt(0).toUpperCase() + method.slice(1).replace(/_/g, ' ')
                return (
                  <div key={method} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-indigo-100">
                      <Smartphone className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
                      <p className="text-xl font-bold text-slate-800 mt-0.5">{formatCurrency(amount)}</p>
                    </div>
                  </div>
                )
              })}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-slate-700">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Deposits</p>
                <p className="text-xl font-bold text-slate-800 mt-0.5">
                  {formatCurrency(Object.values(topupByMethod).reduce((s, v) => s + v, 0))}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Section 2: Withdrawal Log ── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-700">Withdrawal Log</h2>

        {/* New withdrawal form */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-600" />
            Log a Withdrawal
          </h3>
          <form onSubmit={addWithdrawal} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Account */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Account</label>
              <select
                value={fAccount}
                onChange={e => setFAccount(e.target.value as 'zelle' | 'stripe' | 'cash')}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="cash">Cash</option>
                <option value="zelle">Zelle</option>
                <option value="stripe">Stripe / CC</option>
              </select>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Amount ($)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={fAmount}
                onChange={e => setFAmount(e.target.value)}
                placeholder="0.00"
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Date</label>
              <input
                type="date"
                value={fDate}
                onChange={e => setFDate(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Note */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Note</label>
              <input
                type="text"
                value={fNote}
                onChange={e => setFNote(e.target.value)}
                placeholder="What was it for?"
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Submit */}
            <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {saving ? 'Saving…' : 'Log Withdrawal'}
              </button>
            </div>
          </form>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {loadingLog ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading…</div>
          ) : withdrawals.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">No withdrawals logged yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Account</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Note</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {withdrawals.map(w => (
                    <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5 text-slate-700 whitespace-nowrap">
                        {format(new Date(w.date + 'T12:00:00'), 'MMM d, yyyy')}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          w.account === 'cash'
                            ? 'bg-green-100 text-green-700'
                            : w.account === 'zelle'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {ACCOUNT_LABELS[w.account] ?? w.account}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-slate-800 whitespace-nowrap">
                        {formatCurrency(w.amount)}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 max-w-xs truncate">
                        {w.note || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => deleteWithdrawal(w.id)}
                          className="text-slate-300 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
