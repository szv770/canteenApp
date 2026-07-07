'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  X, DollarSign, Pencil, Archive, Snowflake, ChevronDown, ChevronUp,
  TrendingUp, ShoppingCart, BarChart2, Star, AlertTriangle
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { BochurWithId, AccountType } from '@/types/database'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  bochur: BochurWithId
  accountTypes: AccountType[]
  onClose: () => void
  onUpdated: () => void
}

interface Stats {
  totalSpent: number
  ordersThisMonth: number
  avgOrderValue: number
  favoriteItem: string | null
}

interface ChartDay {
  date: string
  total: number
}

interface RecentOrder {
  id: string
  order_number: number
  created_at: string
  total: number
  status: string
  order_items: { product_name: string; quantity: number }[]
}

interface LedgerEntry {
  id: string
  created_at: string
  type: string
  amount: number
  note: string | null
  method: string | null
}

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  Regular: 'bg-blue-50 text-blue-700 border border-blue-100',
  Shliach: 'bg-purple-50 text-purple-700 border border-purple-100',
  'Cost Price': 'bg-orange-50 text-orange-700 border border-orange-100',
  Moised: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  'Canteen Worker': 'bg-amber-50 text-amber-700 border border-amber-100',
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  voided: 'bg-slate-100 text-slate-500 border border-slate-200',
  refunded: 'bg-amber-50 text-amber-700 border border-amber-100',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub }: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="admin-card p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-slate-400">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-lg font-bold text-slate-900 leading-tight">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export default function BochurProfileModal({ bochur: initialBochur, accountTypes, onClose, onUpdated }: Props) {
  const supabase = createClient()

  // local bochur state so freeze/unfreeze updates reflect immediately
  const [bochur, setBochur] = useState<BochurWithId>(initialBochur)

  // data
  const [stats, setStats] = useState<Stats | null>(null)
  const [chartData, setChartData] = useState<ChartDay[]>([])
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)

  // UI state
  const [showTopup, setShowTopup] = useState(false)
  const [showRefund, setShowRefund] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showFreezeConfirm, setShowFreezeConfirm] = useState(false)
  const [freezeReason, setFreezeReason] = useState(bochur.freeze_reason || '')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [freezing, setFreezing] = useState(false)
  const [archiving, setArchiving] = useState(false)

  // account settings
  const [settingsForm, setSettingsForm] = useState({
    allow_negative: bochur.allow_negative,
    max_negative_balance: bochur.max_negative_balance,
    notes: bochur.notes || '',
  })
  const [savingSettings, setSavingSettings] = useState(false)

  // ── Load analytics ─────────────────────────────────────────────────────────
  const loadAnalytics = useCallback(async () => {
    setLoading(true)
    const now = new Date()
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // Fetch all completed orders for this bochur
    const [allOrdersRes, monthOrdersRes, recentOrdersRes, ledgerRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id, total, created_at')
        .eq('bochur_id', bochur.id)
        .eq('status', 'completed'),
      supabase
        .from('orders')
        .select('id')
        .eq('bochur_id', bochur.id)
        .eq('status', 'completed')
        .gte('created_at', firstOfMonth),
      supabase
        .from('orders')
        .select('id, order_number, created_at, total, status, order_items(product_name, quantity)')
        .eq('bochur_id', bochur.id)
        .order('created_at', { ascending: false })
        .limit(15),
      supabase
        .from('balance_ledger')
        .select('id, created_at, type, amount, note, method')
        .eq('bochur_id', bochur.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    const allOrders = allOrdersRes.data || []
    const totalSpent = allOrders.reduce((sum, o) => sum + (o.total || 0), 0)
    const orderCount = allOrders.length
    const avgOrderValue = orderCount > 0 ? totalSpent / orderCount : 0
    const ordersThisMonth = (monthOrdersRes.data || []).length

    // Chart data: group by date over last 30 days
    const recentCompleted = allOrders.filter(o => o.created_at >= thirtyDaysAgo)
    const byDate: Record<string, number> = {}
    recentCompleted.forEach(o => {
      const d = o.created_at.slice(0, 10)
      byDate[d] = (byDate[d] || 0) + (o.total || 0)
    })
    // Build last 30 days array
    const chart: ChartDay[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      const key = d.toISOString().slice(0, 10)
      chart.push({ date: key.slice(5), total: Math.round((byDate[key] || 0) * 100) / 100 })
    }
    setChartData(chart)

    // Favorite item: fetch order_items for all orders
    let favoriteItem: string | null = null
    if (allOrders.length > 0) {
      const orderIds = allOrders.map(o => o.id)
      const { data: items } = await supabase
        .from('order_items')
        .select('product_name, quantity')
        .in('order_id', orderIds)
      if (items && items.length > 0) {
        const tally: Record<string, number> = {}
        items.forEach(i => { tally[i.product_name] = (tally[i.product_name] || 0) + i.quantity })
        favoriteItem = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] || null
      }
    }

    setStats({ totalSpent, ordersThisMonth, avgOrderValue, favoriteItem })
    setRecentOrders((recentOrdersRes.data as unknown as RecentOrder[]) || [])
    setLedger(ledgerRes.data || [])
    setLoading(false)
  }, [bochur.id])

  useEffect(() => { loadAnalytics() }, [loadAnalytics])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // ── Actions ────────────────────────────────────────────────────────────────

  async function toggleFreeze() {
    setFreezing(true)
    const newFrozen = !bochur.is_frozen
    const { error } = await supabase
      .from('bochurim')
      .update({
        is_frozen: newFrozen,
        freeze_reason: newFrozen ? (freezeReason.trim() || null) : null,
      })
      .eq('id', bochur.id)
    if (error) { toast.error(error.message); setFreezing(false); return }
    toast.success(newFrozen ? 'Account frozen' : 'Account unfrozen')
    setBochur(b => ({ ...b, is_frozen: newFrozen, freeze_reason: newFrozen ? (freezeReason.trim() || null) : null }))
    setShowFreezeConfirm(false)
    setFreezing(false)
    onUpdated()
  }

  async function archiveBochur() {
    if (!confirm(`Archive ${bochur.name}? They will no longer appear in POS searches.`)) return
    setArchiving(true)
    const { error } = await supabase.from('bochurim').update({ archived: true }).eq('id', bochur.id)
    if (error) { toast.error(error.message); setArchiving(false); return }
    toast.success('Bochur archived')
    onUpdated()
  }

  async function saveSettings() {
    setSavingSettings(true)
    const { error } = await supabase.from('bochurim').update({
      allow_negative: settingsForm.allow_negative,
      max_negative_balance: settingsForm.max_negative_balance,
      notes: settingsForm.notes || null,
    }).eq('id', bochur.id)
    if (error) { toast.error(error.message); setSavingSettings(false); return }
    toast.success('Settings saved')
    setBochur(b => ({ ...b, ...settingsForm, notes: settingsForm.notes || null }))
    setSavingSettings(false)
    onUpdated()
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const atColor = ACCOUNT_TYPE_COLORS[bochur.account_type?.name] || 'bg-slate-100 text-slate-600 border border-slate-200'
  const balanceColor = bochur.balance >= 0 ? 'text-emerald-600' : 'text-red-500'

  function itemSummary(items: { product_name: string; quantity: number }[]) {
    if (!items || items.length === 0) return '—'
    const names = items.map(i => i.product_name)
    if (names.length <= 2) return names.join(', ')
    return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none">
        <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl max-h-[95vh] sm:max-h-[90vh] flex flex-col animate-scale-in pointer-events-auto">

          {/* ── A. Header ───────────────────────────────────────────────────── */}
          <div className="flex items-start justify-between p-5 border-b border-slate-100 shrink-0">
            <div className="flex-1 min-w-0 pr-4">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h2 className="text-xl font-bold text-slate-900 truncate">{bochur.name}</h2>
                {bochur.is_frozen && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold border border-red-200">
                    <Snowflake className="w-3 h-3" /> Frozen
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs text-slate-400">{bochur.bochur_id}</span>
                {bochur.grade && <span className="text-xs text-slate-400">• {bochur.grade}</span>}
                {bochur.account_type?.name && (
                  <span className={`badge ${atColor} text-xs`}>{bochur.account_type.name}</span>
                )}
              </div>
              <div className={`text-2xl font-extrabold mt-2 ${balanceColor}`}>
                {formatCurrency(bochur.balance)}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors shrink-0"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* ── Scrollable body ─────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* ── B. Quick actions ──────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowTopup(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
              >
                <DollarSign className="w-4 h-4" /> Add Funds
              </button>
              <button
                onClick={() => setShowRefund(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-sm font-medium transition-colors"
              >
                <DollarSign className="w-4 h-4" /> Refund Balance
              </button>
              <button
                onClick={() => { setFreezeReason(bochur.freeze_reason || ''); setShowFreezeConfirm(true) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  bochur.is_frozen
                    ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200'
                    : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                }`}
              >
                <Snowflake className="w-4 h-4" />
                {bochur.is_frozen ? 'Unfreeze Account' : 'Freeze Account'}
              </button>
              <button
                onClick={() => setShowEdit(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors"
              >
                <Pencil className="w-4 h-4" /> Edit Info
              </button>
              <button
                onClick={archiveBochur}
                disabled={archiving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Archive className="w-4 h-4" /> Archive
              </button>
            </div>

            {/* Frozen reason banner */}
            {bochur.is_frozen && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Account is frozen</p>
                  {bochur.freeze_reason && (
                    <p className="text-xs text-red-500 mt-0.5">{bochur.freeze_reason}</p>
                  )}
                </div>
              </div>
            )}

            {loading ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="admin-card p-3 h-20 animate-pulse bg-slate-100" />
                  ))}
                </div>
                <div className="admin-card p-3 h-32 animate-pulse bg-slate-100" />
              </div>
            ) : (
              <>
                {/* ── C. Stats row ───────────────────────────────────────────── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard
                    icon={TrendingUp}
                    label="Total Spent"
                    value={formatCurrency(stats?.totalSpent || 0)}
                  />
                  <StatCard
                    icon={ShoppingCart}
                    label="This Month"
                    value={String(stats?.ordersThisMonth || 0)}
                    sub="orders"
                  />
                  <StatCard
                    icon={BarChart2}
                    label="Avg Order"
                    value={formatCurrency(stats?.avgOrderValue || 0)}
                  />
                  <StatCard
                    icon={Star}
                    label="Favorite Item"
                    value={stats?.favoriteItem || '—'}
                  />
                </div>

                {/* ── D. Spending chart ─────────────────────────────────────── */}
                {chartData.some(d => d.total > 0) && (
                  <div className="admin-card p-4">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Spending — Last 30 Days</h3>
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: '#94a3b8' }}
                          tickLine={false}
                          axisLine={false}
                          interval={6}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#94a3b8' }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={v => `$${v}`}
                        />
                        <Tooltip
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(v: any) => formatCurrency(v as number)}
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                          cursor={{ fill: '#f1f5f9' }}
                        />
                        <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                          {chartData.map((entry, i) => (
                            <Cell key={i} fill={entry.total > 0 ? '#10b981' : '#e2e8f0'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* ── E. Recent transactions ────────────────────────────────── */}
                <div className="admin-card overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-700">Recent Orders</h3>
                  </div>
                  {recentOrders.length === 0 ? (
                    <p className="px-4 py-8 text-center text-slate-400 text-sm">No orders yet</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[480px]">
                        <thead>
                          <tr className="border-b border-slate-50 bg-slate-50/50">
                            <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-2">Date</th>
                            <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-2">Order #</th>
                            <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-2">Items</th>
                            <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-2">Total</th>
                            <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentOrders.map(o => (
                            <tr key={o.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                                {new Date(o.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}
                              </td>
                              <td className="px-4 py-2.5 text-xs font-mono text-slate-500">#{o.order_number}</td>
                              <td className="px-4 py-2.5 text-xs text-slate-600 max-w-[180px] truncate">
                                {itemSummary(o.order_items)}
                              </td>
                              <td className="px-4 py-2.5 text-xs font-bold text-right text-slate-900">
                                {formatCurrency(o.total)}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <span className={`badge text-xs ${STATUS_COLORS[o.status] || 'bg-slate-100 text-slate-500'}`}>
                                  {o.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* ── F. Balance Ledger ─────────────────────────────────────── */}
                <div className="admin-card overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-700">Balance Ledger</h3>
                  </div>
                  {ledger.length === 0 ? (
                    <p className="px-4 py-8 text-center text-slate-400 text-sm">No ledger entries</p>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {ledger.map(entry => (
                        <div key={entry.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50/50 transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-medium text-slate-700 capitalize">{entry.type}</span>
                                {entry.method && (
                                  <span className="text-xs text-slate-400">via {entry.method}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-xs text-slate-400">
                                  {new Date(entry.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}
                                </span>
                                {entry.note && (
                                  <span className="text-xs text-slate-400 truncate max-w-[200px]">• {entry.note}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <span className={`text-sm font-bold shrink-0 ml-3 ${entry.amount >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {entry.amount >= 0 ? '+' : ''}{formatCurrency(entry.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── G. Account Settings (collapsible) ────────────────────── */}
                <div className="admin-card overflow-hidden">
                  <button
                    onClick={() => setSettingsOpen(s => !s)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50/50 transition-colors"
                  >
                    <h3 className="text-sm font-semibold text-slate-700">Account Settings</h3>
                    {settingsOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </button>
                  {settingsOpen && (
                    <div className="px-4 pb-4 space-y-4 border-t border-slate-100">
                      <div className="flex items-center gap-3 pt-3 p-3 bg-slate-50 rounded-xl">
                        <input
                          type="checkbox"
                          id="settings-neg"
                          checked={settingsForm.allow_negative}
                          onChange={e => setSettingsForm(f => ({ ...f, allow_negative: e.target.checked }))}
                          className="rounded"
                        />
                        <label htmlFor="settings-neg" className="text-sm text-slate-700">Allow negative balance</label>
                        {settingsForm.allow_negative && (
                          <div className="flex items-center gap-1 ml-auto">
                            <span className="text-xs text-slate-500">Max -$</span>
                            <input
                              type="number"
                              className="input-admin w-20 text-sm"
                              value={settingsForm.max_negative_balance}
                              onChange={e => setSettingsForm(f => ({ ...f, max_negative_balance: parseFloat(e.target.value) || 0 }))}
                              min={0}
                              step={0.5}
                            />
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                        <textarea
                          className="input-admin resize-none"
                          rows={3}
                          value={settingsForm.notes}
                          onChange={e => setSettingsForm(f => ({ ...f, notes: e.target.value }))}
                          placeholder="Internal notes..."
                        />
                      </div>
                      <button
                        onClick={saveSettings}
                        disabled={savingSettings}
                        className="btn-primary w-full text-sm"
                      >
                        {savingSettings ? 'Saving...' : 'Save Settings'}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Freeze/Unfreeze confirm dialog ──────────────────────────────────── */}
      {showFreezeConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-lg">
              {bochur.is_frozen ? 'Unfreeze Account' : 'Freeze Account'}
            </h3>
            <p className="text-sm text-slate-500">
              {bochur.is_frozen
                ? `This will allow ${bochur.name} to make purchases again.`
                : `Frozen accounts cannot make purchases at the POS.`}
            </p>
            {!bochur.is_frozen && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Reason (optional)</label>
                <input
                  className="input-admin"
                  value={freezeReason}
                  onChange={e => setFreezeReason(e.target.value)}
                  placeholder="e.g. Overdue balance"
                  autoFocus
                />
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowFreezeConfirm(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={toggleFreeze}
                disabled={freezing}
                className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                  bochur.is_frozen
                    ? 'bg-amber-500 hover:bg-amber-600 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                {freezing ? 'Working...' : bochur.is_frozen ? 'Unfreeze' : 'Freeze'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Inline TopupModal ────────────────────────────────────────────────── */}
      {showTopup && (
        <InlineTopupModal
          bochur={bochur}
          onClose={() => setShowTopup(false)}
          onSaved={() => {
            setShowTopup(false)
            supabase.from('bochurim_with_id').select('*').eq('id', bochur.id).single().then(({ data }) => {
              if (data) setBochur(prev => ({ ...prev, balance: data.balance }))
            })
            loadAnalytics()
            onUpdated()
          }}
        />
      )}

      {/* ── Inline RefundModal ───────────────────────────────────────────────── */}
      {showRefund && (
        <InlineRefundModal
          bochur={bochur}
          onClose={() => setShowRefund(false)}
          onSaved={() => {
            setShowRefund(false)
            supabase.from('bochurim_with_id').select('*').eq('id', bochur.id).single().then(({ data }) => {
              if (data) setBochur(prev => ({ ...prev, balance: data.balance }))
            })
            loadAnalytics()
            onUpdated()
          }}
        />
      )}

      {/* ── Inline EditModal ─────────────────────────────────────────────────── */}
      {showEdit && (
        <InlineEditModal
          bochur={bochur}
          accountTypes={accountTypes}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false)
            // Refresh bochur data
            supabase.from('bochurim_with_id').select('*, account_type:account_types(*)').eq('id', bochur.id).single().then(({ data }) => {
              if (data) setBochur(data as unknown as BochurWithId)
            })
            onUpdated()
          }}
        />
      )}
    </>
  )
}

// ─── Inline Topup ─────────────────────────────────────────────────────────────

function InlineTopupModal({ bochur, onClose, onSaved }: {
  bochur: BochurWithId
  onClose: () => void
  onSaved: () => void
}) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/bochur-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bochur_id: bochur.id, amount: amt, method, note: note || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to add funds')
      toast.success(`Added ${formatCurrency(amt)} to ${bochur.name}'s account`)
      onSaved()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add funds')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-lg">Add Funds</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <div className="p-3 bg-slate-50 rounded-xl flex justify-between">
          <span className="text-sm text-slate-600">Current balance</span>
          <span className={`font-bold ${bochur.balance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {formatCurrency(bochur.balance)}
          </span>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Amount</label>
          <input
            autoFocus
            type="number"
            className="input-admin text-lg"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            min={0}
            step={0.5}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Method</label>
          <select className="input-admin" value={method} onChange={e => setMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="zelle">Zelle</option>
            <option value="manual">Manual Adjustment</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Note (optional)</label>
          <input className="input-admin" value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note" />
        </div>
        {amount && parseFloat(amount) > 0 && (
          <div className="p-3 bg-emerald-50 rounded-xl flex justify-between">
            <span className="text-sm text-emerald-700">New balance</span>
            <span className="font-bold text-emerald-700">{formatCurrency(bochur.balance + parseFloat(amount))}</span>
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? 'Adding...' : 'Add Funds'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Inline Refund ────────────────────────────────────────────────────────────

function InlineRefundModal({ bochur, onClose, onSaved }: {
  bochur: BochurWithId
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [zelleConfirmed, setZelleConfirmed] = useState(false)

  const amt = parseFloat(amount) || 0
  const newBalance = Math.round((bochur.balance - amt) * 100) / 100

  async function save() {
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return }
    if (amt > bochur.balance) {
      if (!confirm(`This will bring ${bochur.name}'s balance negative. Continue?`)) return
    }
    if (method === 'zelle' && !zelleConfirmed) {
      toast.error('Please confirm you have sent the Zelle payment first')
      return
    }
    setSaving(true)
    try {
      // Deduct balance
      const { error: balErr } = await supabase
        .from('bochurim')
        .update({ balance: newBalance })
        .eq('id', bochur.id)
      if (balErr) throw new Error(balErr.message)

      // Get current user for cashier_id
      const { data: { user } } = await supabase.auth.getUser()

      // Ledger entry
      const { error: ledgerErr } = await supabase.from('balance_ledger').insert({
        bochur_id: bochur.id,
        amount: -amt,
        type: 'refund',
        method,
        cashier_id: user?.id,
        note: note.trim() || `Balance refund via ${method}`,
      })
      if (ledgerErr) throw new Error(ledgerErr.message)

      toast.success(`Refunded ${formatCurrency(amt)} — balance updated`)
      onSaved()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to process refund')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-lg">Refund Balance</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="p-3 bg-slate-50 rounded-xl flex justify-between">
          <span className="text-sm text-slate-600">Current balance</span>
          <span className={`font-bold ${bochur.balance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {formatCurrency(bochur.balance)}
          </span>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Refund Amount</label>
          <input
            autoFocus
            type="number"
            className="input-admin text-lg"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            min={0}
            step={0.5}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Refund Method</label>
          <select className="input-admin" value={method} onChange={e => { setMethod(e.target.value); setZelleConfirmed(false) }}>
            <option value="cash">Cash — hand money to bochur</option>
            <option value="zelle">Zelle — send to parent/bochur</option>
            <option value="cc">Credit Card — refund to card</option>
          </select>
        </div>

        {/* Method-specific guidance */}
        {method === 'cash' && amt > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm font-medium">
            Have {formatCurrency(amt)} ready to hand back to {bochur.name}.
          </div>
        )}
        {method === 'zelle' && amt > 0 && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
            <p className="text-blue-800 text-sm font-medium">Send {formatCurrency(amt)} via Zelle, then confirm below.</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={zelleConfirmed}
                onChange={e => setZelleConfirmed(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-blue-700">I have sent the Zelle payment</span>
            </label>
          </div>
        )}
        {method === 'cc' && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 text-sm">
            CC refunds will be available once Stripe is connected. Use Cash or Zelle to refund now.
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Note (optional)</label>
          <input className="input-admin" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Parent requested refund" />
        </div>

        {amt > 0 && (
          <div className="p-3 bg-red-50 rounded-xl flex justify-between">
            <span className="text-sm text-red-700">Balance after refund</span>
            <span className={`font-bold ${newBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(newBalance)}</span>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={save}
            disabled={saving || !amt || (method === 'cc')}
            className="flex-1 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? 'Processing...' : 'Confirm Refund'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Inline Edit ──────────────────────────────────────────────────────────────

function InlineEditModal({ bochur, accountTypes, onClose, onSaved }: {
  bochur: BochurWithId
  accountTypes: AccountType[]
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [form, setForm] = useState({
    name: bochur.name,
    grade: bochur.grade || '',
    phone: bochur.phone || '',
    account_type_id: bochur.account_type_id || accountTypes[0]?.id || '',
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    const { error } = await supabase.from('bochurim').update(form).eq('id', bochur.id)
    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success('Bochur updated!')
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-lg">Edit Info</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
          <input autoFocus className="input-admin" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Grade</label>
            <input className="input-admin" value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} placeholder="Aleph" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
            <input className="input-admin" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Account Type</label>
          <select className="input-admin" value={form.account_type_id} onChange={e => setForm(f => ({ ...f, account_type_id: e.target.value }))}>
            {accountTypes.map(at => <option key={at.id} value={at.id}>{at.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
