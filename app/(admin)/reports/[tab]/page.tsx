'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  TrendingUp, Download, RefreshCw, Users, ShoppingBag, DollarSign,
  BarChart2, ChevronLeft, ChevronRight, Table2, BarChart3, Printer,
  Trash2, Pencil, Search, X, Check,
} from 'lucide-react'
import BochurProfileModal from '@/app/(admin)/bochurim/BochurProfileModal'
import ProductQuickViewModal from '@/components/admin/ProductQuickViewModal'
import CashierQuickViewModal from '@/components/admin/CashierQuickViewModal'
import type { BochurWithId, AccountType } from '@/types/database'

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6']

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'products' | 'profit' | 'students'
type DateRange = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_30' | 'this_summer' | 'custom'

interface RawOrderItem {
  product_id: string | null
  product_name: string
  variant_label: string | null
  quantity: number
  unit_price: number
  total: number
  order_id: string
  orders: { id: string; created_at: string; status: string } | null
  products: { cost_price: number | null; product_categories: { categories: { name: string } | null }[] } | null
}
interface RawOrder {
  id: string; status: string; total: number; bochur_id: string | null; created_at: string
  cashier_profiles: { id: string; name: string } | null
  bochurim: { name: string; account_types: { name: string } | null } | null
}
interface WastageItem {
  id: string; product_id: string | null; product_name: string; quantity: number; unit_cost: number
  reason: string; notes: string | null; created_at: string
  cashier_profiles: { id: string; name: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  i === 0 ? '12a' : i < 12 ? `${i}a` : i === 12 ? '12p' : `${i - 12}p`
)
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const METHOD_LABELS: Record<string, string> = {
  balance: 'Balance', cash: 'Cash', credit_card: 'Credit Card', card: 'Credit Card',
  zelle: 'Zelle', venmo: 'Venmo', paypal: 'PayPal', cashapp: 'Cash App',
}

function todayStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
function daysAgoStr(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Builds day boundaries from the browser's LOCAL calendar date, not UTC. Using
// Date.UTC(now.getUTCFullYear(), ...) here was a real bug: it rolls the "today"
// boundary over at UTC midnight, which is hours before/after local midnight
// depending on timezone, so "Today" silently excluded most of the actual local
// business day (only orders from the last few UTC-hours of the local day showed
// up). `new Date(y, m, d)` interprets its arguments as LOCAL time and computes
// the correct underlying UTC instant automatically, so .toISOString() below still
// serializes correctly for the `created_at` (timestamptz) comparison regardless
// of the browser/server timezone.
function getDateRange(range: Exclude<DateRange, 'custom'>): { from: Date; to: Date } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  const dow = (now.getDay() + 6) % 7 // 0=Mon, 6=Sun
  if (range === 'today') return { from: today, to: tomorrow }
  if (range === 'yesterday') {
    const y = new Date(today); y.setDate(y.getDate() - 1)
    return { from: y, to: today }
  }
  if (range === 'this_week') {
    const from = new Date(today); from.setDate(today.getDate() - dow)
    return { from, to: tomorrow }
  }
  if (range === 'last_week') {
    const thisMonday = new Date(today); thisMonday.setDate(today.getDate() - dow)
    const lastMonday = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate() - 7)
    return { from: lastMonday, to: thisMonday }
  }
  if (range === 'this_month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: tomorrow }
  if (range === 'this_summer') return { from: new Date(now.getFullYear(), 5, 1), to: tomorrow }
  // last_30
  const from = new Date(today); from.setDate(from.getDate() - 30)
  return { from, to: tomorrow }
}

// Navigate current custom range by N days (used for prev/next arrows). Local-date
// arithmetic throughout, matching fmtDate/getDateRange above.
function shiftDays(from: string, to: string, days: number): { from: string; to: string } {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const f = new Date(fy, fm - 1, fd + days)
  const t = new Date(ty, tm - 1, td + days)
  return { from: fmtDate(f), to: fmtDate(t) }
}

// ─── UI Atoms ─────────────────────────────────────────────────────────────────
function Skeleton({ h = 220 }: { h?: number }) {
  return <div className="animate-pulse bg-slate-100 rounded-xl w-full" style={{ height: h }} />
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-slate-100 shadow-sm ${className}`}>{children}</div>
}

function CardHeader({
  title, sub, onToggleTable, tableMode,
}: {
  title: string; sub?: string
  onToggleTable?: () => void; tableMode?: boolean
}) {
  return (
    <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest truncate">{title}</h3>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {onToggleTable && (
        <button onClick={onToggleTable} title={tableMode ? 'Show chart' : 'Show table'}
          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0">
          {tableMode ? <BarChart3 className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  )
}

function StatCard({ label, value, sub, color = 'slate' }: { label: string; value: string; sub?: string; color?: string }) {
  const colors: Record<string, string> = {
    slate: 'text-slate-900', emerald: 'text-emerald-600', red: 'text-red-600', amber: 'text-amber-600', indigo: 'text-indigo-600',
  }
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${colors[color] ?? 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </Card>
  )
}

function CurrencyTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((e: any) => (
        <p key={e.dataKey} style={{ color: e.color ?? '#475569' }}>
          {e.name}: {typeof e.value === 'number' && /revenue|sales|avg|gross|net|cost/i.test(e.name ?? '')
            ? formatCurrency(e.value) : e.value}
        </p>
      ))}
    </div>
  )
}

// ─── Student profile panel ─────────────────────────────────────────────────────
function StudentProfilePanel({
  bochurId, accountTypes, onClose,
}: { bochurId: string; accountTypes: AccountType[]; onClose: () => void }) {
  const supabase = createClient()
  const [bochur, setBochur] = useState<BochurWithId | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('bochurim_with_id')
      .select('*, account_type:account_types(*)')
      .eq('id', bochurId).single()
      .then(({ data }) => { setBochur(data as any); setLoading(false) })
  }, [bochurId])

  if (loading) return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8"><div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /></div>
    </div>
  )
  if (!bochur) return null
  return <BochurProfileModal bochur={bochur} accountTypes={accountTypes} onClose={onClose} onUpdated={onClose} />
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const supabase = createClient()

  // ── UI state ─────────────────────────────────────────────────────────────
  const params = useParams<{ tab: string }>()
  const VALID_TABS: Tab[] = ['overview', 'products', 'profit', 'students']
  const tab: Tab = VALID_TABS.includes(params.tab as Tab) ? (params.tab as Tab) : 'overview'
  const [range, setRange] = useState<DateRange>('this_summer')
  const [customFrom, setCustomFrom] = useState(daysAgoStr(30))
  const [customTo, setCustomTo] = useState(todayStr())
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [tableViews, setTableViews] = useState<Set<string>>(new Set())
  const [profileBochurId, setProfileBochurId] = useState<string | null>(null)
  const [viewingProductId, setViewingProductId] = useState<string | null>(null)
  const [viewingCashierId, setViewingCashierId] = useState<string | null>(null)
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([])
  const [studentSearch, setStudentSearch] = useState('')
  const [editingWastageId, setEditingWastageId] = useState<string | null>(null)
  const [editWastageNotes, setEditWastageNotes] = useState('')

  // ── Raw data ─────────────────────────────────────────────────────────────
  const [rawOrders, setRawOrders] = useState<RawOrder[]>([])
  const [rawItems, setRawItems] = useState<RawOrderItem[]>([])
  const [rawPayments, setRawPayments] = useState<{ method: string; amount: number }[]>([])
  const [allHistoricOrders, setAllHistoricOrders] = useState<{ bochur_id: string; created_at: string }[]>([])
  const [expenses, setExpenses] = useState(0)
  const [wastageTotal, setWastageTotal] = useState(0)
  const [wastageItems, setWastageItems] = useState<WastageItem[]>([])
  const [expenseItems, setExpenseItems] = useState<{ description: string; amount: number; expense_type: string; date: string }[]>([])
  const [unspentCredits, setUnspentCredits] = useState<{ id: string; name: string; balance: number; lastOrder: string | null }[]>([])
  const [bochurimInRange, setBochurimInRange] = useState<Set<string>>(new Set())

  // ── Resolve ISO range ────────────────────────────────────────────────────
  // customFrom/customTo are local "YYYY-MM-DD" calendar dates (from <input type="date">
  // and the Today/N-days-ago string helpers above, both local-time-based). Building the
  // boundary with `+'T00:00:00.000Z'` treated that local date as if it were already UTC —
  // same class of bug as getDateRange below. `new Date(y, m-1, d)` interprets its
  // arguments as LOCAL time and computes the correct UTC instant automatically.
  function resolveISO(): { fromISO: string; toISO: string } {
    if (range === 'custom') {
      const [fy, fm, fd] = customFrom.split('-').map(Number)
      const [ty, tm, td] = customTo.split('-').map(Number)
      return {
        fromISO: new Date(fy, fm - 1, fd).toISOString(),
        toISO: new Date(ty, tm - 1, td + 1).toISOString(), // exclusive: start of the day after `to`
      }
    }
    const { from, to } = getDateRange(range as Exclude<DateRange, 'custom'>)
    return { fromISO: from.toISOString(), toISO: to.toISOString() }
  }

  // ── Preset apply ─────────────────────────────────────────────────────────
  function applyPreset(preset: Exclude<DateRange, 'custom'>) {
    const { from, to } = getDateRange(preset)
    setRange(preset)
    setCustomFrom(fmtDate(from))
    const todisplay = new Date(to); todisplay.setDate(todisplay.getDate() - 1)
    setCustomTo(fmtDate(todisplay))
  }

  // ── Period navigation (prev / next by current range span) ────────────────
  function navigatePeriod(dir: -1 | 1) {
    const f = new Date(customFrom + 'T00:00:00Z')
    const t = new Date(customTo + 'T00:00:00Z')
    const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1
    const shifted = shiftDays(customFrom, customTo, dir * days)
    setCustomFrom(shifted.from); setCustomTo(shifted.to); setRange('custom')
  }

  // ── Toggle chart/table view ──────────────────────────────────────────────
  function toggleTable(key: string) {
    setTableViews(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }

  // ── Fetch data ───────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const { fromISO, toISO } = resolveISO()

    const [ordersRes, itemsRes, paymentsRes, historicRes, expRes, wastRes, bochurRes, wastItemRes, expItemRes, atRes] = await Promise.all([
      supabase.from('orders')
        .select('id, status, total, bochur_id, created_at, cashier_profiles!cashier_id(id, name), bochurim!bochur_id(name, account_types(name))')
        .gte('created_at', fromISO).lt('created_at', toISO),

      supabase.from('order_items')
        .select('order_id, product_id, product_name, variant_label, quantity, unit_price, total, orders!inner(id, created_at, status), products(cost_price, product_categories(categories(name)))')
        .eq('orders.status', 'completed').gte('orders.created_at', fromISO).lt('orders.created_at', toISO),

      supabase.from('payments').select('method, amount, status').gte('created_at', fromISO).lt('created_at', toISO),

      supabase.from('orders').select('bochur_id, created_at').eq('status', 'completed').not('bochur_id', 'is', null),

      supabase.from('expense_entries').select('amount').gte('date', fromISO.split('T')[0]).lte('date', toISO.split('T')[0]),

      supabase.from('wastage_log').select('quantity, unit_cost').gte('created_at', fromISO).lt('created_at', toISO),

      supabase.from('bochurim_with_id').select('id, name, balance').eq('archived', false).gt('balance', 0).order('balance', { ascending: false }).limit(20),

      supabase.from('wastage_log')
        .select('id, product_id, product_name, quantity, unit_cost, reason, notes, created_at, cashier_profiles!cashier_id(id, name)')
        .gte('created_at', fromISO).lt('created_at', toISO).order('created_at', { ascending: false }),

      supabase.from('expense_entries').select('description, amount, expense_type, date')
        .gte('date', fromISO.split('T')[0]).lte('date', toISO.split('T')[0]).order('date', { ascending: false }),

      supabase.from('account_types').select('*').eq('is_active', true).order('name'),
    ])

    const orders = (ordersRes.data || []) as unknown as RawOrder[]
    const items = (itemsRes.data || []) as unknown as RawOrderItem[]
    setRawOrders(orders)
    setRawItems(items)
    setRawPayments((paymentsRes.data || []).map((p: any) => ({ method: p.method, amount: Number(p.amount) })))
    setAllHistoricOrders((historicRes.data || []) as any)
    setExpenses((expRes.data || []).reduce((s: number, e: any) => s + Number(e.amount), 0))
    setWastageTotal((wastRes.data || []).reduce((s: number, w: any) => s + Number(w.unit_cost || 0) * Number(w.quantity), 0))
    setWastageItems((wastItemRes.data || []) as unknown as WastageItem[])
    setExpenseItems((expItemRes.data || []) as any)
    setAccountTypes((atRes.data || []) as AccountType[])

    const allBochurOrders = (historicRes.data || []) as any[]
    const lastOrderMap: Record<string, string> = {}
    for (const o of allBochurOrders) {
      if (!lastOrderMap[o.bochur_id] || o.created_at > lastOrderMap[o.bochur_id]) lastOrderMap[o.bochur_id] = o.created_at
    }
    setUnspentCredits(((bochurRes.data || []) as any[]).map(b => ({
      id: b.id, name: b.name, balance: Number(b.balance), lastOrder: lastOrderMap[b.id] || null,
    })))

    const inRange = new Set<string>()
    const { fromISO: fi, toISO: ti } = resolveISO()
    for (const o of allBochurOrders) {
      if (o.created_at >= fi && o.created_at < ti && o.bochur_id) inRange.add(o.bochur_id)
    }
    setBochurimInRange(inRange)
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, customFrom, customTo])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Wastage delete/edit ──────────────────────────────────────────────────
  async function deleteWastage(id: string) {
    if (!confirm('Delete this wastage entry?')) return
    const { error } = await supabase.from('wastage_log').delete().eq('id', id)
    if (error) { alert('Failed to delete'); return }
    setWastageItems(prev => prev.filter(w => w.id !== id))
    setWastageTotal(prev => {
      const w = wastageItems.find(x => x.id === id)
      return w ? prev - Number(w.unit_cost) * w.quantity : prev
    })
  }

  async function saveWastageNotes(id: string) {
    const { error } = await supabase.from('wastage_log').update({ notes: editWastageNotes || null }).eq('id', id)
    if (error) { alert('Failed to save'); return }
    setWastageItems(prev => prev.map(w => w.id === id ? { ...w, notes: editWastageNotes || null } : w))
    setEditingWastageId(null)
  }

  // ── CSV export ────────────────────────────────────────────────────────────
  async function exportCSV() {
    setExporting(true)
    try {
      const { fromISO, toISO } = resolveISO()
      const { data } = await supabase.from('orders')
        .select('id, created_at, total, status, bochurim!bochur_id(name), cashier_profiles!cashier_id(name), payments(method, amount), order_items(product_name, variant_label, quantity, unit_price, total)')
        .eq('status', 'completed').gte('created_at', fromISO).lt('created_at', toISO)
        .order('created_at', { ascending: true })
      if (!data?.length) { alert('No orders in this date range.'); return }
      const rows: string[] = []
      for (const o of data as any[]) {
        const d = new Date(o.created_at)
        const methods = Array.isArray(o.payments) ? o.payments.map((p: any) => p.method).join('/') : ''
        const items = Array.isArray(o.order_items)
          ? o.order_items.map((i: any) => `${i.product_name}${i.variant_label ? ' (' + i.variant_label + ')' : ''} ×${i.quantity}`).join('; ')
          : ''
        rows.push([
          d.toLocaleDateString('en-US'), d.toLocaleTimeString('en-US'), o.id,
          `"${o.bochurim?.name || 'Walk-in'}"`, `"${o.cashier_profiles?.name || ''}"`,
          `"${methods}"`, Number(o.total).toFixed(2), `"${items}"`,
        ].join(','))
      }
      const csv = ['Date,Time,Order ID,Student,Cashier,Payment Method,Total,Items', ...rows].join('\n')
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
        download: `canteen-orders-${customFrom}-to-${customTo}.csv`,
      })
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
    } finally { setExporting(false) }
  }

  // ── Derived data (useMemo) ────────────────────────────────────────────────
  const allCategories = useMemo(() => {
    const cats = new Set<string>()
    for (const item of rawItems) {
      const cat = (item.products as any)?.product_categories?.[0]?.categories?.name
      if (cat) cats.add(cat)
    }
    return Array.from(cats).sort()
  }, [rawItems])

  const filteredItems = useMemo(() => {
    if (!selectedCategory) return rawItems
    return rawItems.filter(item => (item.products as any)?.product_categories?.[0]?.categories?.name === selectedCategory)
  }, [rawItems, selectedCategory])

  const completedOrders = useMemo(() => rawOrders.filter(o => o.status === 'completed'), [rawOrders])
  const gross = useMemo(() => completedOrders.reduce((s, o) => s + Number(o.total), 0), [completedOrders])
  const orderCount = completedOrders.length
  const avgOrder = orderCount > 0 ? gross / orderCount : 0
  const uniqueStudents = useMemo(() => new Set(completedOrders.filter(o => o.bochur_id).map(o => o.bochur_id)).size, [completedOrders])
  const voidStats = useMemo(() => {
    const voided = rawOrders.filter(o => o.status === 'voided').length
    const refunded = rawOrders.filter(o => o.status === 'refunded').length
    const total = rawOrders.length
    return { voided, refunded, total, rate: total > 0 ? ((voided + refunded) / total) * 100 : 0 }
  }, [rawOrders])

  const { fromISO: _fi, toISO: _ti } = useMemo(() => resolveISO(), [range, customFrom, customTo])

  const dailyRevenue = useMemo(() => {
    // Bucket by LOCAL calendar date — created_at.split('T')[0] would use the UTC
    // date instead, silently shifting evening orders onto the next day's bar.
    const map: Record<string, number> = {}
    for (const o of completedOrders) { const k = fmtDate(new Date(o.created_at)); map[k] = (map[k] || 0) + Number(o.total) }
    const result: { date: string; revenue: number }[] = []
    const cur = new Date(_fi); const end = new Date(_ti)
    while (cur < end) {
      const key = fmtDate(cur)
      const label = cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      result.push({ date: label, revenue: map[key] || 0 })
      cur.setDate(cur.getDate() + 1)
    }
    return result
  }, [completedOrders, _fi, _ti])

  const hourlyData = useMemo(() => {
    const map: Record<number, { revenue: number; count: number }> = {}
    for (let h = 0; h < 24; h++) map[h] = { revenue: 0, count: 0 }
    for (const o of completedOrders) { const h = new Date(o.created_at).getHours(); map[h].revenue += Number(o.total); map[h].count += 1 }
    return Array.from({ length: 24 }, (_, i) => ({ label: HOUR_LABELS[i], revenue: map[i].revenue, count: map[i].count }))
  }, [completedOrders])

  const dowData = useMemo(() => {
    const map: Record<number, { revenue: number; count: number }> = {}
    for (let i = 0; i < 7; i++) map[i] = { revenue: 0, count: 0 }
    for (const o of completedOrders) { const d = new Date(o.created_at).getDay(); map[d].revenue += Number(o.total); map[d].count += 1 }
    return [1, 2, 3, 4, 5, 6, 0].map(i => ({ day: DOW_LABELS[i], revenue: map[i].revenue, avg: map[i].count > 0 ? map[i].revenue / map[i].count : 0 }))
  }, [completedOrders])

  const paymentData = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of rawPayments) { const label = METHOD_LABELS[p.method] || p.method || 'Other'; map[label] = (map[label] || 0) + p.amount }
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [rawPayments])

  const cashierStats = useMemo(() => {
    const map: Record<string, { id: string | null; orders: number; revenue: number }> = {}
    for (const o of completedOrders) {
      const cp = o.cashier_profiles as any
      const name = cp?.name || 'Unknown'
      if (!map[name]) map[name] = { id: cp?.id || null, orders: 0, revenue: 0 }
      map[name].orders += 1; map[name].revenue += Number(o.total)
    }
    return Object.entries(map).map(([name, d]) => ({ name, ...d, avg: d.orders > 0 ? d.revenue / d.orders : 0 })).sort((a, b) => b.revenue - a.revenue)
  }, [completedOrders])

  const customerStats = useMemo(() => {
    const firstOrder: Record<string, string> = {}
    for (const o of allHistoricOrders) {
      if (!firstOrder[o.bochur_id] || o.created_at < firstOrder[o.bochur_id]) firstOrder[o.bochur_id] = o.created_at
    }
    let newC = 0, returningC = 0
    for (const bid of Array.from(bochurimInRange)) {
      if (firstOrder[bid] >= _fi && firstOrder[bid] < _ti) newC++; else returningC++
    }
    return { new: newC, returning: returningC }
  }, [allHistoricOrders, bochurimInRange, _fi, _ti])

  const topSellers = useMemo(() => {
    const map: Record<string, { name: string; productId: string | null; units: number; revenue: number }> = {}
    for (const item of filteredItems) {
      const key = `${item.product_id ?? item.product_name}|${item.variant_label ?? ''}`
      if (!map[key]) map[key] = { name: item.variant_label ? `${item.product_name} (${item.variant_label})` : item.product_name, productId: item.product_id, units: 0, revenue: 0 }
      map[key].units += item.quantity; map[key].revenue += Number(item.total)
    }
    return Object.values(map).sort((a, b) => b.units - a.units).slice(0, 12)
  }, [filteredItems])

  const bottomSellers = useMemo(() => {
    const map: Record<string, { name: string; productId: string | null; units: number; revenue: number }> = {}
    for (const item of filteredItems) {
      const key = `${item.product_id ?? item.product_name}|${item.variant_label ?? ''}`
      if (!map[key]) map[key] = { name: item.variant_label ? `${item.product_name} (${item.variant_label})` : item.product_name, productId: item.product_id, units: 0, revenue: 0 }
      map[key].units += item.quantity; map[key].revenue += Number(item.total)
    }
    return Object.values(map).filter(p => p.units > 0).sort((a, b) => a.units - b.units).slice(0, 10)
  }, [filteredItems])

  const categoryRevenue = useMemo(() => {
    const map: Record<string, { revenue: number; units: number }> = {}
    for (const item of rawItems) {
      const cat = (item.products as any)?.product_categories?.[0]?.categories?.name || 'Uncategorised'
      if (!map[cat]) map[cat] = { revenue: 0, units: 0 }
      map[cat].revenue += Number(item.total); map[cat].units += item.quantity
    }
    return Object.entries(map).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.revenue - a.revenue)
  }, [rawItems])

  const fbtPairs = useMemo(() => {
    const orderProds: Record<string, { id: string; name: string }[]> = {}
    for (const item of filteredItems) {
      const oid = (item.orders as any)?.id || item.order_id; if (!oid) continue
      if (!orderProds[oid]) orderProds[oid] = []
      const key = `${item.product_id ?? item.product_name}|${item.variant_label ?? ''}`
      const name = item.variant_label ? `${item.product_name} (${item.variant_label})` : item.product_name
      orderProds[oid].push({ id: key, name })
    }
    const counts: Record<string, { a: string; b: string; count: number }> = {}
    for (const prods of Object.values(orderProds)) {
      const unique = Array.from(new Map(prods.map(p => [p.id, p])).values())
      for (let i = 0; i < unique.length; i++) for (let j = i + 1; j < unique.length; j++) {
        const [pa, pb] = unique[i].name <= unique[j].name ? [unique[i], unique[j]] : [unique[j], unique[i]]
        const key = `${pa.id}||${pb.id}`
        if (!counts[key]) counts[key] = { a: pa.name, b: pb.name, count: 0 }
        counts[key].count++
      }
    }
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 10)
  }, [filteredItems])

  const cogs = useMemo(() => rawItems.reduce((s, item) => s + Number((item.products as any)?.cost_price || 0) * item.quantity, 0), [rawItems])
  const cogsBreakdown = useMemo(() => {
    const map: Record<string, { name: string; productId: string | null; units: number; costPerUnit: number; total: number }> = {}
    for (const item of rawItems) {
      const cost = Number((item.products as any)?.cost_price || 0); if (cost <= 0) continue
      const key = `${item.product_id ?? item.product_name}|${item.variant_label ?? ''}`
      const name = item.variant_label ? `${item.product_name} (${item.variant_label})` : item.product_name
      if (!map[key]) map[key] = { name, productId: item.product_id, units: 0, costPerUnit: cost, total: 0 }
      map[key].units += item.quantity; map[key].total += cost * item.quantity
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [rawItems])
  const net = gross - cogs - expenses - wastageTotal
  const margin = gross > 0 ? (net / gross) * 100 : 0

  const topSpenders = useMemo(() => {
    const map: Record<string, { id: string; name: string; total: number; orders: number }> = {}
    for (const o of completedOrders) {
      if (!o.bochur_id) continue
      const name = (o.bochurim as any)?.name || 'Unknown'
      if (!map[o.bochur_id]) map[o.bochur_id] = { id: o.bochur_id, name, total: 0, orders: 0 }
      map[o.bochur_id].total += Number(o.total); map[o.bochur_id].orders += 1
    }
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 20)
  }, [completedOrders])

  const filteredSpenders = useMemo(() => {
    if (!studentSearch.trim()) return topSpenders
    const q = studentSearch.toLowerCase()
    return topSpenders.filter(s => s.name.toLowerCase().includes(q))
  }, [topSpenders, studentSearch])

  const visitFrequency = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const o of allHistoricOrders) {
      if (o.created_at >= _fi && o.created_at < _ti) counts[o.bochur_id] = (counts[o.bochur_id] || 0) + 1
    }
    let f1 = 0, f2to5 = 0, f6plus = 0
    for (const c of Object.values(counts)) { if (c === 1) f1++; else if (c <= 5) f2to5++; else f6plus++ }
    return [{ bucket: '1 visit', count: f1 }, { bucket: '2–5 visits', count: f2to5 }, { bucket: '6+ visits', count: f6plus }]
  }, [allHistoricOrders, _fi, _ti])

  const accountTypeRevenue = useMemo(() => {
    const map: Record<string, number> = {}
    for (const o of completedOrders) {
      const at = (o.bochurim as any)?.account_types?.name || (o.bochur_id ? 'No Type' : 'Walk-in')
      map[at] = (map[at] || 0) + Number(o.total)
    }
    return Object.entries(map).map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue)
  }, [completedOrders])

  // ── Render ────────────────────────────────────────────────────────────────
  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { id: 'products', label: 'Products', icon: <ShoppingBag className="w-3.5 h-3.5" /> },
    { id: 'profit', label: 'Profit & COGS', icon: <DollarSign className="w-3.5 h-3.5" /> },
    { id: 'students', label: 'Students', icon: <Users className="w-3.5 h-3.5" /> },
  ]
  const PRESETS: { value: Exclude<DateRange, 'custom'>; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'this_week', label: 'This Week' },
    { value: 'last_week', label: 'Last Week' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_30', label: '30 Days' },
    { value: 'this_summer', label: '☀️ This Summer' },
  ]

  return (
    <div className="min-h-screen bg-slate-50/50 print:bg-white">
      {/* ── Print styles ──────────────────────────────────────────────────── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
          @page { margin: 1cm; }
        }
      `}</style>

      {/* ── Sticky header ──────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 shadow-sm no-print">
        <div className="max-w-7xl mx-auto px-3 sm:px-6">
          {/* Top row */}
          <div className="flex items-center justify-between py-2.5 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <BarChart2 className="w-5 h-5 text-indigo-500 shrink-0" />
              <h1 className="text-base font-bold text-slate-900 tracking-tight hidden sm:block">Reports</h1>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {/* Navigation arrows */}
              <div className="flex items-center gap-0.5">
                <button onClick={() => navigatePeriod(-1)} title="Previous period"
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => navigatePeriod(1)} title="Next period"
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Date pickers */}
              <div className="flex items-center gap-1 text-xs">
                <input type="date" value={customFrom}
                  onChange={e => { setCustomFrom(e.target.value); setRange('custom') }}
                  className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 w-32" />
                <span className="text-slate-400">–</span>
                <input type="date" value={customTo}
                  onChange={e => { setCustomTo(e.target.value); setRange('custom') }}
                  className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 w-32" />
              </div>

              <button onClick={fetchData} title="Refresh" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button onClick={() => window.print()} title="Print" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <Printer className="w-4 h-4" />
              </button>
              <button onClick={exportCSV} disabled={exporting || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all">
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">CSV</span>
              </button>
            </div>
          </div>

          {/* Preset pills */}
          <div className="flex items-center gap-1 pb-2 overflow-x-auto no-scrollbar">
            {PRESETS.map(p => (
              <button key={p.value} onClick={() => applyPreset(p.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                  range === p.value ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                {p.label}
              </button>
            ))}
            {range === 'custom' && (
              <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 shrink-0">Custom</span>
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-0.5 -mb-px overflow-x-auto no-scrollbar">
            {TABS.map(t => (
              <Link key={t.id} href={`/reports/${t.id}`}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
                  tab === t.id ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}>
                {t.icon}{t.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-5 space-y-5">

        {/* ── OVERVIEW TAB ─────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {loading ? Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-5"><Skeleton h={52} /></Card>) : <>
                <StatCard label="Total Revenue" value={formatCurrency(gross)} sub={`${orderCount} orders`} />
                <StatCard label="Avg Order" value={formatCurrency(avgOrder)} sub="per completed order" color="indigo" />
                <StatCard label="Unique Students" value={String(uniqueStudents)} sub={`${customerStats.new} new · ${customerStats.returning} returning`} />
                <StatCard label="Void / Refund Rate" value={`${voidStats.rate.toFixed(1)}%`} sub={`${voidStats.voided} voided · ${voidStats.refunded} refunded`} color={voidStats.rate > 5 ? 'red' : 'slate'} />
              </>}
            </div>

            {/* Daily revenue */}
            <Card>
              <CardHeader title="Daily Revenue" sub={`${dailyRevenue.length} days in period`}
                onToggleTable={() => toggleTable('daily')} tableMode={tableViews.has('daily')} />
              <div className="p-5">
                {loading ? <Skeleton /> : dailyRevenue.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-10">No orders in this period</p>
                ) : tableViews.has('daily') ? (
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-slate-100"><th className="text-left pb-2 text-xs font-semibold text-slate-400 uppercase">Date</th><th className="text-right pb-2 text-xs font-semibold text-slate-400 uppercase">Revenue</th></tr></thead>
                      <tbody className="divide-y divide-slate-50">
                        {dailyRevenue.map((r, i) => <tr key={i}><td className="py-1.5 text-slate-700">{r.date}</td><td className="py-1.5 text-right font-semibold text-emerald-600">{formatCurrency(r.revenue)}</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={dailyRevenue} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                        interval={Math.max(0, Math.floor(dailyRevenue.length / 8) - 1)} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                      <Tooltip content={<CurrencyTip />} />
                      <Line type="monotone" dataKey="revenue" name="Revenue" stroke={C[0]} strokeWidth={2}
                        dot={dailyRevenue.length <= 31} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* Hourly + DOW */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Card>
                <CardHeader title="Revenue by Hour" onToggleTable={() => toggleTable('hourly')} tableMode={tableViews.has('hourly')} />
                <div className="p-5">
                  {loading ? <Skeleton /> : tableViews.has('hourly') ? (
                    <div className="overflow-x-auto max-h-64">
                      <table className="w-full text-sm"><thead><tr className="border-b border-slate-100"><th className="text-left pb-2 text-xs text-slate-400 uppercase">Hour</th><th className="text-right pb-2 text-xs text-slate-400 uppercase">Revenue</th><th className="text-right pb-2 text-xs text-slate-400 uppercase">Orders</th></tr></thead>
                        <tbody className="divide-y divide-slate-50">{hourlyData.filter(h => h.revenue > 0).map((h, i) => <tr key={i}><td className="py-1.5 text-slate-700">{h.label}</td><td className="py-1.5 text-right font-semibold text-indigo-600">{formatCurrency(h.revenue)}</td><td className="py-1.5 text-right text-slate-500">{h.count}</td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={hourlyData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={2} />
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                        <Tooltip content={<CurrencyTip />} />
                        <Bar dataKey="revenue" name="Revenue" fill={C[0]} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>

              <Card>
                <CardHeader title="Revenue by Day of Week" onToggleTable={() => toggleTable('dow')} tableMode={tableViews.has('dow')} />
                <div className="p-5">
                  {loading ? <Skeleton /> : tableViews.has('dow') ? (
                    <div className="overflow-x-auto max-h-64">
                      <table className="w-full text-sm"><thead><tr className="border-b border-slate-100"><th className="text-left pb-2 text-xs text-slate-400 uppercase">Day</th><th className="text-right pb-2 text-xs text-slate-400 uppercase">Revenue</th><th className="text-right pb-2 text-xs text-slate-400 uppercase">Avg/Day</th></tr></thead>
                        <tbody className="divide-y divide-slate-50">{dowData.map((d, i) => <tr key={i}><td className="py-1.5 text-slate-700">{d.day}</td><td className="py-1.5 text-right font-semibold text-emerald-600">{formatCurrency(d.revenue)}</td><td className="py-1.5 text-right text-slate-500">{formatCurrency(d.avg)}</td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={dowData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                        <Tooltip content={<CurrencyTip />} />
                        <Bar dataKey="revenue" name="Revenue" fill={C[1]} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>
            </div>

            {/* Payment methods + new vs returning */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Card>
                <CardHeader title="Payment Methods" onToggleTable={() => toggleTable('payments')} tableMode={tableViews.has('payments')} />
                <div className="p-5">
                  {loading ? <Skeleton /> : paymentData.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-10">No payment data</p>
                  ) : tableViews.has('payments') ? (
                    <table className="w-full text-sm"><thead><tr className="border-b border-slate-100"><th className="text-left pb-2 text-xs text-slate-400 uppercase">Method</th><th className="text-right pb-2 text-xs text-slate-400 uppercase">Amount</th></tr></thead>
                      <tbody className="divide-y divide-slate-50">{paymentData.map((p, i) => <tr key={i}><td className="py-1.5 flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ background: C[i % C.length] }} />{p.name}</td><td className="py-1.5 text-right font-semibold text-slate-800">{formatCurrency(p.value)}</td></tr>)}</tbody>
                    </table>
                  ) : (
                    <div className="flex items-center gap-4">
                      <ResponsiveContainer width={160} height={160}>
                        <PieChart>
                          <Pie data={paymentData} cx="50%" cy="50%" innerRadius={45} outerRadius={72} dataKey="value" paddingAngle={2}>
                            {paymentData.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: any) => formatCurrency(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex-1 space-y-2 min-w-0">
                        {paymentData.map((p, i) => (
                          <div key={p.name} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0"><div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: C[i % C.length] }} /><span className="text-sm text-slate-600 truncate">{p.name}</span></div>
                            <span className="text-sm font-semibold text-slate-800 shrink-0">{formatCurrency(p.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              <Card>
                <CardHeader title="New vs Returning Students" />
                <div className="p-5">
                  {loading ? <Skeleton /> : (
                    <div className="flex items-center gap-6">
                      <ResponsiveContainer width={140} height={140}>
                        <PieChart>
                          <Pie data={[{ name: 'New', value: customerStats.new }, { name: 'Returning', value: customerStats.returning }]}
                            cx="50%" cy="50%" innerRadius={40} outerRadius={62} dataKey="value" paddingAngle={2}>
                            <Cell fill={C[2]} /><Cell fill={C[0]} />
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-3">
                        {[{ label: 'New', value: customerStats.new, color: C[2] }, { label: 'Returning', value: customerStats.returning, color: C[0] }].map(s => (
                          <div key={s.label}>
                            <div className="flex items-center gap-2 mb-0.5"><div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} /><span className="text-xs text-slate-500 font-medium">{s.label}</span></div>
                            <p className="text-2xl font-bold text-slate-900 ml-4">{s.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Cashier stats */}
            {!loading && cashierStats.length > 0 && (
              <Card>
                <CardHeader title="Cashier Performance" onToggleTable={() => toggleTable('cashier')} tableMode={tableViews.has('cashier')} />
                {tableViews.has('cashier') || true ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr className="border-b border-slate-100 bg-slate-50/50">
                        {['Cashier', 'Orders', 'Revenue', 'Avg Order'].map(h => (
                          <th key={h} className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody className="divide-y divide-slate-50">
                        {cashierStats.map((c, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-3 text-sm font-medium text-slate-800">
                              {c.id ? (
                                <button type="button" onClick={() => setViewingCashierId(c.id)}
                                  className="hover:underline hover:text-indigo-600 text-left">{c.name}</button>
                              ) : c.name}
                            </td>
                            <td className="px-5 py-3 text-sm text-slate-600">{c.orders}</td>
                            <td className="px-5 py-3 text-sm font-semibold text-emerald-600">{formatCurrency(c.revenue)}</td>
                            <td className="px-5 py-3 text-sm text-slate-600">{formatCurrency(c.avg)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </Card>
            )}
          </>
        )}

        {/* ── PRODUCTS TAB ─────────────────────────────────────────────── */}
        {tab === 'products' && (
          <>
            {/* Category filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide shrink-0">Filter by category:</span>
              <button onClick={() => setSelectedCategory(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${!selectedCategory ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'}`}>
                All
              </button>
              {allCategories.map(cat => (
                <button key={cat} onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${selectedCategory === cat ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'}`}>
                  {cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              {/* Category revenue bars */}
              <Card className="lg:col-span-2">
                <CardHeader title="Revenue by Category" />
                <div className="p-5">
                  {loading ? <Skeleton /> : categoryRevenue.length === 0 ? <p className="text-sm text-slate-400 text-center py-10">No data</p> : (
                    <div className="space-y-3">
                      {categoryRevenue.map((cat, i) => {
                        const pct = gross > 0 ? (cat.revenue / gross) * 100 : 0
                        return (
                          <div key={cat.name}>
                            <div className="flex items-center justify-between mb-1">
                              <button onClick={() => setSelectedCategory(cat.name === selectedCategory ? null : cat.name)} className="flex items-center gap-2 group">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: C[i % C.length] }} />
                                <span className={`text-sm font-medium group-hover:text-indigo-600 transition-colors ${selectedCategory === cat.name ? 'text-indigo-600' : 'text-slate-700'}`}>{cat.name}</span>
                              </button>
                              <div className="text-right">
                                <span className="text-sm font-semibold text-slate-800">{formatCurrency(cat.revenue)}</span>
                                <span className="text-xs text-slate-400 ml-1.5">{pct.toFixed(0)}%</span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: C[i % C.length] }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </Card>

              {/* Top sellers */}
              <Card className="lg:col-span-3">
                <CardHeader title={selectedCategory ? `Top Products — ${selectedCategory}` : 'Top Products'} sub="By units sold"
                  onToggleTable={() => toggleTable('top')} tableMode={tableViews.has('top')} />
                <div className="p-5">
                  {loading ? <Skeleton h={260} /> : topSellers.length === 0 ? <p className="text-sm text-slate-400 text-center py-10">No sales data</p> :
                    tableViews.has('top') ? (
                      <div className="overflow-x-auto max-h-96">
                        <table className="w-full text-sm"><thead><tr className="border-b border-slate-100"><th className="text-left pb-2 text-xs text-slate-400 uppercase">#</th><th className="text-left pb-2 text-xs text-slate-400 uppercase">Product</th><th className="text-right pb-2 text-xs text-slate-400 uppercase">Units</th><th className="text-right pb-2 text-xs text-slate-400 uppercase">Revenue</th></tr></thead>
                          <tbody className="divide-y divide-slate-50">{topSellers.map((p, i) => <tr key={i}><td className="py-1.5 text-xs text-slate-400">{i + 1}</td><td className="py-1.5 text-slate-700 font-medium">{p.productId ? <button type="button" onClick={() => setViewingProductId(p.productId!)} className="hover:underline hover:text-indigo-600 text-left">{p.name}</button> : p.name}</td><td className="py-1.5 text-right text-slate-600">{p.units}</td><td className="py-1.5 text-right font-semibold text-emerald-600">{formatCurrency(p.revenue)}</td></tr>)}</tbody>
                        </table>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={Math.max(220, topSellers.length * 30)}>
                        <BarChart data={topSellers} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                          <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} axisLine={false} width={130} />
                          <Tooltip content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null
                            const d = payload[0]?.payload
                            return <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-xs"><p className="font-semibold text-slate-700 mb-1">{label}</p><p className="text-emerald-600">{d.units} units</p><p className="text-slate-500">{formatCurrency(d.revenue)}</p></div>
                          }} />
                          <Bar dataKey="units" name="Units" fill={C[1]} radius={[0, 3, 3, 0]} label={{ position: 'right', fontSize: 10, fill: '#94a3b8' }} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                </div>
              </Card>
            </div>

            {/* Bottom sellers */}
            {!loading && bottomSellers.length > 0 && (
              <Card>
                <CardHeader title={selectedCategory ? `Slowest Sellers — ${selectedCategory}` : 'Slowest Sellers'} sub="Fewest units sold"
                  onToggleTable={() => toggleTable('bottom')} tableMode={tableViews.has('bottom')} />
                <div className="p-5">
                  {tableViews.has('bottom') ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm"><thead><tr className="border-b border-slate-100"><th className="text-left pb-2 text-xs text-slate-400 uppercase">Product</th><th className="text-right pb-2 text-xs text-slate-400 uppercase">Units</th><th className="text-right pb-2 text-xs text-slate-400 uppercase">Revenue</th></tr></thead>
                        <tbody className="divide-y divide-slate-50">{bottomSellers.map((p, i) => <tr key={i}><td className="py-1.5 text-slate-700 font-medium">{p.productId ? <button type="button" onClick={() => setViewingProductId(p.productId!)} className="hover:underline hover:text-indigo-600 text-left">{p.name}</button> : p.name}</td><td className="py-1.5 text-right text-red-500 font-semibold">{p.units}</td><td className="py-1.5 text-right text-slate-500">{formatCurrency(p.revenue)}</td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(180, bottomSellers.length * 28)}>
                      <BarChart data={bottomSellers} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} axisLine={false} width={130} />
                        <Tooltip content={<CurrencyTip />} />
                        <Bar dataKey="units" name="Units" fill={C[3]} radius={[0, 3, 3, 0]} label={{ position: 'right', fontSize: 10, fill: '#94a3b8' }} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>
            )}

            {/* FBT pairs */}
            {!loading && fbtPairs.length > 0 && (
              <Card>
                <CardHeader title="Frequently Bought Together" sub="Most common product pairs" />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-slate-100 bg-slate-50/50"><th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Product A</th><th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Product B</th><th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Times Together</th></tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {fbtPairs.map((p, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-2.5 text-sm text-slate-700">{p.a}</td>
                          <td className="px-5 py-2.5 text-sm text-slate-700">{p.b}</td>
                          <td className="px-5 py-2.5 text-right text-sm font-semibold text-indigo-600">{p.count}×</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}

        {/* ── PROFIT & COGS TAB ────────────────────────────────────────── */}
        {tab === 'profit' && (
          <>
            {/* Financial strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {loading ? Array.from({ length: 6 }).map((_, i) => <Card key={i} className="p-5"><Skeleton h={52} /></Card>) : <>
                <StatCard label="Gross Sales" value={formatCurrency(gross)} sub={`${orderCount} orders`} />
                <StatCard label="Product COGS" value={formatCurrency(cogs)} color="amber" />
                <StatCard label="Expenses" value={formatCurrency(expenses)} color="red" />
                <StatCard label="Wastage" value={formatCurrency(wastageTotal)} color="red" />
                <StatCard label="Net Profit" value={formatCurrency(net)} color={net >= 0 ? 'emerald' : 'red'} sub={`${margin.toFixed(1)}% margin`} />
                <Card className="p-5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Cost Mix</p>
                  <div className="mt-3 space-y-2">
                    {gross > 0 && [['COGS', cogs, C[2]], ['Exp', expenses, C[3]], ['Waste', wastageTotal, '#f97316']].map(([lbl, val, col]) => (
                      <div key={String(lbl)} className="flex items-center gap-1.5">
                        <div className="h-1.5 rounded-full shrink-0" style={{ width: `${Math.max(4, (Number(val) / gross) * 100)}%`, background: String(col) }} />
                        <span className="text-xs text-slate-400">{lbl} {((Number(val) / gross) * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </>}
            </div>

            {/* COGS breakdown table */}
            {!loading && cogsBreakdown.length > 0 && (
              <Card>
                <CardHeader title="Product COGS Breakdown" sub="Cost × units sold" />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-slate-100 bg-slate-50/50">{['Product', 'Units', 'Cost/Unit', 'Total Cost'].map((h, i) => <th key={h} className={`text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {cogsBreakdown.map((row, i) => (
                        <tr key={i} className={`hover:bg-slate-50/50 transition-colors ${i % 2 === 1 ? 'bg-slate-50/30' : ''}`}>
                          <td className="px-5 py-2.5 text-sm font-medium text-slate-700">
                            {row.productId ? (
                              <button type="button" onClick={() => setViewingProductId(row.productId!)}
                                className="hover:underline hover:text-indigo-600 text-left">{row.name}</button>
                            ) : row.name}
                          </td>
                          <td className="px-5 py-2.5 text-sm text-slate-600 text-right">{row.units}</td>
                          <td className="px-5 py-2.5 text-sm text-slate-600 text-right">{formatCurrency(row.costPerUnit)}</td>
                          <td className="px-5 py-2.5 text-sm font-semibold text-amber-600 text-right">{formatCurrency(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t border-slate-200"><td colSpan={3} className="px-5 pt-3 text-xs font-semibold text-slate-500 uppercase">Total</td><td className="px-5 pt-3 text-right font-bold text-amber-600">{formatCurrency(cogsBreakdown.reduce((s, r) => s + r.total, 0))}</td></tr></tfoot>
                  </table>
                </div>
              </Card>
            )}

            {/* Expenses + Wastage */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Card>
                <CardHeader title="Expense Entries" sub={formatCurrency(expenses) + ' total'} />
                <div className="overflow-y-auto max-h-80">
                  {loading ? <div className="p-5"><Skeleton h={120} /></div> : expenseItems.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">No expenses in this period</p>
                  ) : (
                    <table className="w-full">
                      <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-100"><th className="text-left text-xs font-semibold text-slate-400 uppercase px-5 py-2.5">Description</th><th className="text-left text-xs font-semibold text-slate-400 uppercase px-3 py-2.5">Type</th><th className="text-right text-xs font-semibold text-slate-400 uppercase px-5 py-2.5">Amount</th></tr></thead>
                      <tbody className="divide-y divide-slate-50">
                        {expenseItems.map((e, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-2.5 text-sm text-slate-700 max-w-[200px] truncate">{e.description || '—'}</td>
                            <td className="px-3 py-2.5 text-xs text-slate-500 capitalize">{e.expense_type?.replace(/_/g, ' ')}</td>
                            <td className="px-5 py-2.5 text-sm font-semibold text-red-500 text-right">{formatCurrency(Number(e.amount))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Card>

              <Card>
                <CardHeader title="Wastage Log" sub={formatCurrency(wastageTotal) + ' in waste cost'} />
                <div className="overflow-y-auto max-h-80">
                  {loading ? <div className="p-5"><Skeleton h={120} /></div> : wastageItems.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">No wastage logged in this period</p>
                  ) : (
                    <table className="w-full">
                      <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-100"><th className="text-left text-xs font-semibold text-slate-400 uppercase px-5 py-2.5">Product</th><th className="text-center text-xs font-semibold text-slate-400 uppercase px-2 py-2.5">Qty</th><th className="text-left text-xs font-semibold text-slate-400 uppercase px-2 py-2.5">Notes / Cashier</th><th className="text-right text-xs font-semibold text-slate-400 uppercase px-4 py-2.5">Cost</th><th className="px-2 py-2.5"></th></tr></thead>
                      <tbody className="divide-y divide-slate-50">
                        {wastageItems.map((w) => (
                          <tr key={w.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-2.5">
                              <p className="text-sm text-slate-700">
                                {w.product_id ? (
                                  <button type="button" onClick={() => setViewingProductId(w.product_id!)}
                                    className="hover:underline hover:text-indigo-600 text-left">{w.product_name}</button>
                                ) : w.product_name}
                              </p>
                              <p className="text-xs text-slate-400">{w.reason}</p>
                            </td>
                            <td className="px-2 py-2.5 text-sm text-slate-600 text-center">{w.quantity}</td>
                            <td className="px-2 py-2.5 max-w-[140px]">
                              {editingWastageId === w.id ? (
                                <div className="flex items-center gap-1">
                                  <input autoFocus value={editWastageNotes} onChange={e => setEditWastageNotes(e.target.value)}
                                    className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 min-w-0"
                                    placeholder="Add notes..." />
                                  <button onClick={() => saveWastageNotes(w.id)} className="p-1 text-emerald-500 hover:text-emerald-700"><Check className="w-3 h-3" /></button>
                                  <button onClick={() => setEditingWastageId(null)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-3 h-3" /></button>
                                </div>
                              ) : (
                                <div>
                                  {w.notes && <p className="text-xs text-slate-600 truncate">{w.notes}</p>}
                                  {w.cashier_profiles?.name && (
                                    <button type="button" onClick={() => setViewingCashierId(w.cashier_profiles!.id)}
                                      className="text-xs text-slate-400 hover:underline hover:text-indigo-600 text-left">
                                      {w.cashier_profiles.name}
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-sm font-semibold text-orange-500 text-right">{formatCurrency(Number(w.unit_cost || 0) * w.quantity)}</td>
                            <td className="px-2 py-2.5">
                              <div className="flex items-center gap-0.5 justify-end">
                                <button onClick={() => { setEditingWastageId(w.id); setEditWastageNotes(w.notes || '') }}
                                  className="p-1 text-slate-300 hover:text-indigo-500 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                                <button onClick={() => deleteWastage(w.id)}
                                  className="p-1 text-slate-300 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Card>
            </div>
          </>
        )}

        {/* ── STUDENTS TAB ─────────────────────────────────────────────── */}
        {tab === 'students' && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Account type revenue */}
              {!loading && accountTypeRevenue.length > 0 && (
                <Card>
                  <CardHeader title="Revenue by Account Type" />
                  <div className="p-5 space-y-3">
                    {accountTypeRevenue.map((at, i) => {
                      const pct = gross > 0 ? (at.revenue / gross) * 100 : 0
                      return (
                        <div key={at.name}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full shrink-0" style={{ background: C[i % C.length] }} /><span className="text-sm text-slate-700 font-medium">{at.name}</span></div>
                            <div className="text-right"><span className="text-sm font-semibold text-slate-800">{formatCurrency(at.revenue)}</span><span className="text-xs text-slate-400 ml-1.5">{pct.toFixed(0)}%</span></div>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: C[i % C.length] }} /></div>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              )}

              {/* Visit frequency */}
              <Card>
                <CardHeader title="Visit Frequency" sub="Students by number of visits" />
                <div className="p-5 space-y-4">
                  {loading ? <Skeleton /> : visitFrequency.map((vf, i) => {
                    const total = visitFrequency.reduce((s, f) => s + f.count, 0)
                    const pct = total > 0 ? (vf.count / total) * 100 : 0
                    return (
                      <div key={vf.bucket}>
                        <div className="flex items-center justify-between mb-1"><span className="text-sm text-slate-600 font-medium">{vf.bucket}</span><span className="text-sm font-bold text-slate-800">{vf.count}</span></div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: C[i] }} /></div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            </div>

            {/* Top spenders — searchable with clickable names */}
            <Card>
              <CardHeader title="Top Spenders" sub="Click a name to open their profile" />
              <div className="px-5 pt-4 pb-2">
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-400/30 focus-within:border-indigo-400">
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <input type="text" placeholder="Search student name..." value={studentSearch} onChange={e => setStudentSearch(e.target.value)}
                    className="flex-1 text-sm text-slate-900 placeholder-slate-400 bg-transparent outline-none" />
                  {studentSearch && <button onClick={() => setStudentSearch('')}><X className="w-4 h-4 text-slate-400" /></button>}
                </div>
              </div>
              {loading ? (
                <div className="p-5"><Skeleton h={300} /></div>
              ) : filteredSpenders.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-10">{studentSearch ? 'No match' : 'No student orders in this period'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-slate-100 bg-slate-50/50">{['#', 'Student', 'Orders', 'Total Spent', 'Avg Order'].map(h => <th key={h} className={`text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3 ${h === '#' ? 'w-8' : ''} ${['Total Spent', 'Avg Order', 'Orders'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredSpenders.map((s, i) => (
                        <tr key={s.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-5 py-2.5 text-xs font-bold text-slate-400">{i + 1}</td>
                          <td className="px-5 py-2.5">
                            <button onClick={() => setProfileBochurId(s.id)}
                              className="text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline text-left">
                              {s.name}
                            </button>
                          </td>
                          <td className="px-5 py-2.5 text-sm text-slate-600 text-right">{s.orders}</td>
                          <td className="px-5 py-2.5 text-sm font-bold text-indigo-600 text-right">{formatCurrency(s.total)}</td>
                          <td className="px-5 py-2.5 text-sm text-slate-500 text-right">{formatCurrency(s.orders > 0 ? s.total / s.orders : 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Unspent credits */}
            {!loading && unspentCredits.length > 0 && (
              <Card>
                <CardHeader title="Unspent Account Balances" sub={`${formatCurrency(unspentCredits.reduce((s, b) => s + b.balance, 0))} total outstanding`} />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-slate-100 bg-slate-50/50">{['Student', 'Balance', 'Last Order', 'Active in Period'].map(h => <th key={h} className={`text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3 ${h === 'Student' ? 'text-left' : 'text-right'}`}>{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {unspentCredits.map((b, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-2.5">
                            <button onClick={() => setProfileBochurId(b.id)} className="text-sm font-medium text-indigo-600 hover:underline text-left">{b.name}</button>
                          </td>
                          <td className="px-5 py-2.5 text-sm font-bold text-emerald-600 text-right">{formatCurrency(b.balance)}</td>
                          <td className="px-5 py-2.5 text-xs text-slate-500 text-right">{b.lastOrder ? new Date(b.lastOrder).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Never'}</td>
                          <td className="px-5 py-2.5 text-right">
                            {bochurimInRange.has(b.id)
                              ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">Yes</span>
                              : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">No</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      {/* ── Student profile modal ──────────────────────────────────────── */}
      {profileBochurId && (
        <StudentProfilePanel
          bochurId={profileBochurId}
          accountTypes={accountTypes}
          onClose={() => setProfileBochurId(null)}
        />
      )}

      {/* ── Product / Cashier quick-view modals ──────────────────────────── */}
      {viewingProductId && (
        <ProductQuickViewModal productId={viewingProductId} onClose={() => setViewingProductId(null)} />
      )}
      {viewingCashierId && (
        <CashierQuickViewModal cashierId={viewingCashierId} onClose={() => setViewingCashierId(null)} />
      )}
    </div>
  )
}
