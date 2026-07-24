'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Wallet, Plus, Trash2, RefreshCw, DollarSign, CreditCard, Smartphone, Banknote, Users, CheckCircle2, Clock, X, Download } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import AccountTransactionsModal from '@/components/admin/AccountTransactionsModal'
import { fetchAccountTransactions, KIND_LABELS, ACCOUNT_KEYS } from '@/lib/accountTransactions'

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
  reason: string | null
  paid_to: string | null
  confirmed_received: boolean
  confirmation_method: string | null
  confirmed_at: string | null
  created_at: string
}

const ACCOUNT_LABELS: Record<string, string> = {
  zelle: 'Zelle',
  stripe: 'Credit Card',
  cash: 'Cash',
  venmo: 'Venmo',
  paypal: 'PayPal',
  cashapp: 'Cash App',
}

// Fixed display order for account-related lists/cards below.
const ACCOUNT_ORDER = ['cash', 'zelle', 'stripe', 'venmo', 'paypal', 'cashapp']

const ACCOUNT_BADGE_COLORS: Record<string, string> = {
  cash: 'bg-green-100 text-green-700',
  zelle: 'bg-purple-100 text-purple-700',
  stripe: 'bg-blue-100 text-blue-700',
  venmo: 'bg-sky-100 text-sky-700',
  paypal: 'bg-indigo-100 text-indigo-700',
  cashapp: 'bg-emerald-100 text-emerald-700',
}

const REASON_OPTIONS: { value: string; label: string }[] = [
  { value: 'owner_draw', label: 'Owner draw' },
  { value: 'bank_deposit', label: 'Bank deposit' },
  { value: 'supplies', label: 'Supplies purchase' },
  { value: 'refund_reimbursement', label: 'Refund reimbursement' },
  { value: 'vendor_payment', label: 'Preorder vendor payment' },
  { value: 'other', label: 'Other' },
]
const REASON_LABELS: Record<string, string> = Object.fromEntries(REASON_OPTIONS.map(r => [r.value, r.label]))

const CONFIRMATION_METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: 'in_person', label: 'Handed in person / counted with them' },
  { value: 'verbal_text_call', label: 'Verbal, text, or call confirmation' },
  { value: 'bank_app_confirmation', label: 'Bank/Zelle/app confirmation screen' },
  { value: 'signed_receipt', label: 'Signed receipt' },
]
const CONFIRMATION_METHOD_LABELS: Record<string, string> = Object.fromEntries(CONFIRMATION_METHOD_OPTIONS.map(o => [o.value, o.label]))

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

  // ── Withdrawal log (filtered to the same date range as the balance cards) ─
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([])
  const [loadingLog, setLoadingLog] = useState(false)

  // ── Net account balances (all-time, independent of the date range) ───────
  const [netReceived, setNetReceived] = useState<Record<string, number>>({})
  const [netWithdrawn, setNetWithdrawn] = useState<Record<string, number>>({})
  const [loadingNet, setLoadingNet] = useState(false)

  // ── New withdrawal form ──────────────────────────────────────────────────
  const [fAccount, setFAccount] = useState<'zelle' | 'stripe' | 'cash' | 'venmo' | 'paypal' | 'cashapp'>('cash')
  const [fAmount, setFAmount] = useState('')
  const [fDate, setFDate] = useState(todayStr())
  const [fReason, setFReason] = useState('')
  const [fPaidTo, setFPaidTo] = useState('')
  const [fNote, setFNote] = useState('')
  const [saving, setSaving] = useState(false)

  // ── Drill-down / confirmation modals ──────────────────────────────────────
  const [selectedAccountKey, setSelectedAccountKey] = useState<string | null>(null)
  const [confirmingWithdrawal, setConfirmingWithdrawal] = useState<WithdrawalRow | null>(null)

  // ── CSV export (all-time, all accounts) ───────────────────────────────────
  const [exportingCSV, setExportingCSV] = useState(false)

  useEffect(() => { loadPayments() }, [from, to])
  useEffect(() => { loadWithdrawals() }, [from, to])
  useEffect(() => { loadNetBalances() }, [])

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
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) toast.error('Failed to load withdrawal log')
    setWithdrawals(data || [])
    setLoadingLog(false)
  }

  // All-time (not date-filtered) received-vs-withdrawn per account, so the
  // page can show "what should actually be sitting in this account right now"
  // independent of whatever range is picked for the headline cards above.
  async function loadNetBalances() {
    setLoadingNet(true)
    const [{ data: payments }, { data: topups }, { data: allWithdrawals }, { data: ledgerRows }] = await Promise.all([
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

    setNetReceived(received)
    setNetWithdrawn(withdrawn)
    setLoadingNet(false)
  }

  async function addWithdrawal(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(fAmount)
    if (!fAmount || isNaN(amt) || amt <= 0) { toast.error('Enter a valid amount'); return }
    if (!fReason) { toast.error('Select a reason'); return }
    if (!fPaidTo.trim()) { toast.error('Enter who this was paid to'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('withdrawal_log').insert({
      account: fAccount,
      amount: amt,
      date: fDate,
      reason: fReason,
      paid_to: fPaidTo.trim(),
      note: fNote.trim() || null,
      recorded_by: user?.id ?? null,
      // confirmed_received defaults to false — log now, come back and mark it
      // confirmed once you actually hear back that they received it.
    })
    if (error) { toast.error('Failed to save: ' + error.message); setSaving(false); return }
    toast.success('Withdrawal logged as pending confirmation')
    setFAmount('')
    setFReason('')
    setFPaidTo('')
    setFNote('')
    setFDate(todayStr())
    setSaving(false)
    loadWithdrawals()
    loadNetBalances()
  }

  async function markWithdrawalConfirmed(withdrawal: WithdrawalRow, confirmationMethod: string) {
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('withdrawal_log').update({
      confirmed_received: true,
      confirmation_method: confirmationMethod,
      confirmed_at: new Date().toISOString(),
      confirmed_by: user?.id ?? null,
    }).eq('id', withdrawal.id)
    if (error) { toast.error('Failed to save: ' + error.message); return }
    toast.success('Marked as confirmed')
    setConfirmingWithdrawal(null)
    loadWithdrawals()
  }

  async function deleteWithdrawal(id: string) {
    if (!confirm('Delete this withdrawal record?')) return
    const { error } = await supabase.from('withdrawal_log').delete().eq('id', id)
    if (error) { toast.error('Delete failed: ' + error.message); return }
    toast.success('Deleted')
    setWithdrawals(prev => prev.filter(w => w.id !== id))
    loadNetBalances()
  }

  // One CSV across every account, all-time — open it directly in Google Sheets
  // (File > Import > Upload) or Excel to share with a bookkeeper/partner.
  async function exportCSV() {
    setExportingCSV(true)
    try {
      const perAccount = await Promise.all(ACCOUNT_KEYS.map(key => fetchAccountTransactions(supabase, key)))
      const rows = perAccount.flat().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      const escape = (v: string | number | null | undefined) => {
        const s = v === null || v === undefined ? '' : String(v)
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const header = ['Date', 'Account', 'Type', 'Who / Paid To', 'Detail', 'Reason', 'Amount', 'Confirmed', 'Confirmation Method']
      const lines = [header.join(',')]
      for (const r of rows) {
        lines.push([
          escape(r.date.slice(0, 10)),
          escape(ACCOUNT_LABELS[r.account] ?? r.account),
          escape(KIND_LABELS[r.kind]),
          escape(r.who),
          escape(r.detail),
          escape(r.reason ? (REASON_LABELS[r.reason] ?? r.reason) : ''),
          escape(r.amount.toFixed(2)),
          escape(r.kind === 'withdrawal_out' ? (r.confirmed ? 'Yes' : 'No') : ''),
          escape(r.confirmationMethod ? (CONFIRMATION_METHOD_LABELS[r.confirmationMethod] ?? r.confirmationMethod) : ''),
        ].join(','))
      }

      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `accounts-export-${todayStr()}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('CSV downloaded — open it in Google Sheets via File > Import')
    } catch (err: any) {
      toast.error('Export failed: ' + (err?.message || 'unknown error'))
    } finally {
      setExportingCSV(false)
    }
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

  // Net balance = all-time received minus all-time withdrawn, per account —
  // independent of the from/to range above. Only surfaced for accounts that
  // have ever seen activity, so venmo/paypal/cashapp stay hidden until used.
  const netRows = ACCOUNT_ORDER
    .map(key => {
      const received = netReceived[key] || 0
      const withdrawn = netWithdrawn[key] || 0
      return { key, label: ACCOUNT_LABELS[key], received, withdrawn, net: received - withdrawn }
    })
    .filter(r => r.received !== 0 || r.withdrawn !== 0)

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
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-sm">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Accounts</h1>
            <p className="text-sm text-slate-500">Payment balances & withdrawal tracking</p>
          </div>
        </div>
        <button
          onClick={exportCSV}
          disabled={exportingCSV}
          title="Download every transaction across all accounts as a CSV — open it in Google Sheets via File > Import, or in Excel"
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:border-emerald-300 hover:text-emerald-700 text-slate-600 text-sm font-medium rounded-xl shadow-sm transition-colors disabled:opacity-50"
        >
          <Download className={`w-4 h-4 ${exportingCSV ? 'animate-bounce' : ''}`} />
          {exportingCSV ? 'Exporting…' : 'Export CSV'}
        </button>
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

      {/* ── Section 1c: Net Account Balances (all-time) ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-700">Net Account Balances</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            All-time money in minus all-time money out, per account — what should actually be sitting there right now.
            Counts POS payments, top-ups, cash kept as change-to-balance, tagged Add Funds entries, refunds paid back
            to students, and the withdrawal log below. Not affected by the date range above. Excludes voided
            cash/credit-card orders&rsquo; original payment — voiding doesn&rsquo;t track whether cash was physically
            handed back, so log a withdrawal separately if it was. Click a card to see every transaction behind it.
          </p>
        </div>

        {loadingNet ? (
          <div className="text-sm text-slate-400">Loading…</div>
        ) : netRows.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 text-sm text-slate-400 text-center">
            No account activity yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {netRows.map(r => (
              <button
                key={r.key}
                onClick={() => setSelectedAccountKey(r.key)}
                className="text-left bg-white rounded-2xl shadow-sm border border-slate-200 p-5 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer"
              >
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{r.label}</p>
                <p className={`text-xl font-bold mt-0.5 ${r.net < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                  {formatCurrency(r.net)}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {formatCurrency(r.received)} in &minus; {formatCurrency(r.withdrawn)} out
                </p>
                <p className="text-xs text-emerald-600 mt-2 font-medium">View transactions →</p>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedAccountKey && (
        <AccountTransactionsModal
          accountKey={selectedAccountKey}
          accountLabel={ACCOUNT_LABELS[selectedAccountKey] ?? selectedAccountKey}
          onClose={() => setSelectedAccountKey(null)}
        />
      )}

      {/* ── Section 2: Withdrawal Log ── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-700">Withdrawal Log</h2>
        <p className="text-sm text-slate-400 -mt-2">Filtered to the date range selected above.</p>

        {/* New withdrawal form */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-600" />
            Log a Withdrawal
          </h3>
          <form onSubmit={addWithdrawal} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            {/* Account */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Account</label>
              <select
                value={fAccount}
                onChange={e => setFAccount(e.target.value as 'zelle' | 'stripe' | 'cash' | 'venmo' | 'paypal' | 'cashapp')}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="cash">Cash</option>
                <option value="zelle">Zelle</option>
                <option value="stripe">Credit Card</option>
                <option value="venmo">Venmo</option>
                <option value="paypal">PayPal</option>
                <option value="cashapp">Cash App</option>
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

            {/* Reason */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Reason</label>
              <select
                value={fReason}
                onChange={e => setFReason(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="" disabled>Select a reason…</option>
                {REASON_OPTIONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Paid To */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Paid To</label>
              <input
                type="text"
                value={fPaidTo}
                onChange={e => setFPaidTo(e.target.value)}
                placeholder="Who received this?"
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Note */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Note <span className="text-slate-300">(optional)</span></label>
              <input
                type="text"
                value={fNote}
                onChange={e => setFNote(e.target.value)}
                placeholder="Any extra detail"
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Submit */}
            <div className="sm:col-span-2 lg:col-span-6 flex justify-end">
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
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Paid To</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Reason</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Note</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
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
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ACCOUNT_BADGE_COLORS[w.account] ?? 'bg-slate-100 text-slate-700'}`}>
                          {ACCOUNT_LABELS[w.account] ?? w.account}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-slate-800 whitespace-nowrap">
                        {formatCurrency(w.amount)}
                      </td>
                      <td className="px-5 py-3.5 text-slate-700 max-w-[140px] truncate">
                        {w.paid_to || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">
                        {w.reason ? (REASON_LABELS[w.reason] ?? w.reason) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 max-w-xs truncate">
                        {w.note || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {w.confirmed_received ? (
                          <span
                            title={w.confirmed_at ? `Confirmed ${format(new Date(w.confirmed_at), 'MMM d, yyyy')} — ${CONFIRMATION_METHOD_LABELS[w.confirmation_method || ''] ?? w.confirmation_method}` : 'Confirmed'}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Confirmed
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmingWithdrawal(w)}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                          >
                            <Clock className="w-3.5 h-3.5" /> Pending — mark confirmed
                          </button>
                        )}
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

      {confirmingWithdrawal && (
        <ConfirmWithdrawalModal
          withdrawal={confirmingWithdrawal}
          onClose={() => setConfirmingWithdrawal(null)}
          onConfirm={method => markWithdrawalConfirmed(confirmingWithdrawal, method)}
        />
      )}
    </div>
  )
}

function ConfirmWithdrawalModal({
  withdrawal, onClose, onConfirm,
}: { withdrawal: WithdrawalRow; onClose: () => void; onConfirm: (method: string) => void }) {
  const [method, setMethod] = useState('')
  const [saving, setSaving] = useState(false)

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-lg">Confirm Receipt</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <div className="p-3 bg-slate-50 rounded-xl">
          <p className="text-sm text-slate-600">
            {formatCurrency(withdrawal.amount)} to <span className="font-semibold text-slate-800">{withdrawal.paid_to || 'Unspecified'}</span>
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">How was it confirmed?</label>
          <select
            className="input-admin"
            value={method}
            onChange={e => setMethod(e.target.value)}
          >
            <option value="" disabled>Select…</option>
            {CONFIRMATION_METHOD_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={() => { if (!method) return; setSaving(true); onConfirm(method) }}
            disabled={!method || saving}
            className="flex-1 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Mark Confirmed'}
          </button>
        </div>
      </div>
    </div>
  )
}
