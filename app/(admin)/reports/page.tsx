'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { TrendingUp, Download, RefreshCw, Users, ShoppingBag, DollarSign, BarChart2 } from 'lucide-react'

// ─── Palette (validated categorical order) ────────────────────────────────────
const C = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6']

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'products' | 'profit' | 'students'
type DateRange = 'today' | 'this_week' | 'this_month' | 'last_30' | 'custom'

interface RawOrderItem {
  product_id: string | null
  product_name: string
  variant_label: string | null
  quantity: number
  unit_price: number
  total: number
  order_id: string
  orders: { id: string; created_at: string; status: string } | null
  products: {
    cost_price: number | null
    product_categories: { categories: { name: string } | null }[]
  } | null
}
interface RawOrder {
  id: string
  status: string
  total: number
  bochur_id: string | null
  created_at: string
  cashier_profiles: { name: string } | null
  bochurim: { name: string; account_types: { name: string } | null } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  i === 0 ? '12a' : i < 12 ? `${i}a` : i === 12 ? '12p' : `${i - 12}p`
)
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const METHOD_LABELS: Record<string, string> = {
  balance: 'Balance', cash: 'Cash', credit_card: 'Credit Card', card: 'Credit Card', zelle: 'Zelle',
}

function todayStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
function daysAgoStr(days: number) {
  const d = new Date(); d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function getDateRange(range: Exclude<DateRange, 'custom'>) {
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const to = new Date(today); to.setUTCDate(to.getUTCDate() + 1)
  if (range === 'today') return { from: today, to }
  if (range === 'this_week') {
    const from = new Date(today); from.setUTCDate(today.getUTCDate() - ((now.getUTCDay() + 6) % 7))
    return { from, to }
  }
  if (range === 'this_month') return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to }
  const from = new Date(today); from.setUTCDate(from.getUTCDate() - 30)
  return { from, to }
}
function fmtDate(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

// ─── UI Atoms ─────────────────────────────────────────────────────────────────
function Skeleton({ h = 220 }: { h?: number }) {
  return <div className="animate-pulse bg-slate-100 rounded-xl w-full" style={{ height: h }} />
}
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-slate-100 shadow-sm ${className}`}>{children}</div>
}
function CardHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{title}</h3>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </div>
  )
}
function StatCard({ label, value, sub, color = 'slate' }: { label: string; value: string; sub?: string; color?: string }) {
  const colors: Record<string, string> = {
    slate: 'text-slate-900', emerald: 'text-emerald-600', red: 'text-red-600',
    amber: 'text-amber-600', indigo: 'text-indigo-600',
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
          {e.name}: {typeof e.value === 'number' && (e.name?.toLowerCase().includes('revenue') || e.name?.toLowerCase().includes('sales') || e.name?.toLowerCase().includes('avg') || e.name?.toLowerCase().includes('gross') || e.name?.toLowerCase().includes('net') || e.name?.toLowerCase().includes('cost'))
            ? formatCurrency(e.value) : e.value}
        </p>
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('overview')
  const [range, setRange] = useState<DateRange>('last_30')
  const [customFrom, setCustomFrom] = useState(daysAgoStr(30))
  const [customTo, setCustomTo] = useState(todayStr())
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  // Raw data from DB
  const [rawOrders, setRawOrders] = useState<RawOrder[]>([])
  const [rawItems, setRawItems] = useState<RawOrderItem[]>([])
  const [rawPayments, setRawPayments] = useState<{ method: string; amount: number }[]>([])
  const [allHistoricOrders, setAllHistoricOrders] = useState<{ bochur_id: string; created_at: string }[]>([])
  const [expenses, setExpenses] = useState(0)
  const [wastageTotal, setWastageTotal] = useState(0)
  const [wastageItems, setWastageItems] = useState<{ product_name: string; quantity: number; unit_cost: number; reason: string; created_at: string }[]>([])
  const [expenseItems, setExpenseItems] = useState<{ description: string; amount: number; expense_type: string; date: string }[]>([])
  const [unspentCredits, setUnspentCredits] = useState<{ id: string; name: string; balance: number; lastOrder: string | null }[]>([])
  const [bochurimInRange, setBochurimInRange] = useState<Set<string>>(new Set())

  function resolveISO(): { fromISO: string; toISO: string } {
    if (range === 'custom') {
      return { fromISO: customFrom + 'T00:00:00.000Z', toISO: customTo + 'T23:59:59.999Z' }
    }
    const { from, to } = getDateRange(range as Exclude<DateRange, 'custom'>)
    return { fromISO: from.toISOString(), toISO: to.toISOString() }
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { fromISO, toISO } = resolveISO()

    const [ordersRes, itemsRes, paymentsRes, historicRes, expRes, wastRes, bochurRes, wastItemRes, expItemRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id, status, total, bochur_id, created_at, cashier_profiles!cashier_id(name), bochurim!bochur_id(name, account_types(name))')
        .gte('created_at', fromISO).lt('created_at', toISO),

      supabase
        .from('order_items')
        .select('order_id, product_id, product_name, variant_label, quantity, unit_price, total, orders!inner(id, created_at, status), products(cost_price, product_categories(categories(name)))')
        .eq('orders.status', 'completed')
        .gte('orders.created_at', fromISO).lt('orders.created_at', toISO),

      supabase
        .from('payments')
        .select('method, amount, status')
        .gte('created_at', fromISO).lt('created_at', toISO),

      supabase
        .from('orders')
        .select('bochur_id, created_at')
        .eq('status', 'completed')
        .not('bochur_id', 'is', null),

      supabase
        .from('expense_entries')
        .select('amount')
        .gte('date', fromISO.split('T')[0]).lte('date', toISO.split('T')[0]),

      supabase
        .from('wastage_log')
        .select('quantity, unit_cost')
        .gte('created_at', fromISO).lt('created_at', toISO),

      supabase
        .from('bochurim_with_id')
        .select('id, name, balance')
        .eq('archived', false).gt('balance', 0)
        .order('balance', { ascending: false }).limit(20),

      supabase
        .from('wastage_log')
        .select('product_name, quantity, unit_cost, reason, created_at')
        .gte('created_at', fromISO).lt('created_at', toISO)
        .order('created_at', { ascending: false }),

      supabase
        .from('expense_entries')
        .select('description, amount, expense_type, date')
        .gte('date', fromISO.split('T')[0]).lte('date', toISO.split('T')[0])
        .order('date', { ascending: false }),
    ])

    const orders = (ordersRes.data || []) as unknown as RawOrder[]
    const items = (itemsRes.data || []) as unknown as RawOrderItem[]
    setRawOrders(orders)
    setRawItems(items)
    setRawPayments((paymentsRes.data || []).map((p: any) => ({ method: p.method, amount: Number(p.amount) })))
    setAllHistoricOrders((historicRes.data || []) as any)
    setExpenses((expRes.data || []).reduce((s: number, e: any) => s + Number(e.amount), 0))
    setWastageTotal((wastRes.data || []).reduce((s: number, w: any) => s + Number(w.unit_cost || 0) * Number(w.quantity), 0))
    setWastageItems((wastItemRes.data || []) as any)
    setExpenseItems((expItemRes.data || []) as any)

    // Unspent credits with last order date
    const allBochurOrders = (historicRes.data || []) as any[]
    const lastOrderMap: Record<string, string> = {}
    for (const o of allBochurOrders) {
      if (!lastOrderMap[o.bochur_id] || o.created_at > lastOrderMap[o.bochur_id]) {
        lastOrderMap[o.bochur_id] = o.created_at
      }
    }
    setUnspentCredits(((bochurRes.data || []) as any[]).map(b => ({
      id: b.id, name: b.name, balance: Number(b.balance),
      lastOrder: lastOrderMap[b.id] || null,
    })))

    const inRange = new Set<string>()
    for (const o of allBochurOrders) {
      if (o.created_at >= fromISO && o.created_at < toISO && o.bochur_id) inRange.add(o.bochur_id)
    }
    setBochurimInRange(inRange)

    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, customFrom, customTo])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Category list (all categories in data) ───────────────────────────────
  const allCategories = useMemo(() => {
    const cats = new Set<string>()
    for (const item of rawItems) {
      const cat = (item.products as any)?.product_categories?.[0]?.categories?.name
      if (cat) cats.add(cat)
    }
    return Array.from(cats).sort()
  }, [rawItems])

  // ── Filtered items (for product/category-level charts) ───────────────────
  const filteredItems = useMemo(() => {
    if (!selectedCategory) return rawItems
    return rawItems.filter(item => {
      const cat = (item.products as any)?.product_categories?.[0]?.categories?.name
      return cat === selectedCategory
    })
  }, [rawItems, selectedCategory])

  // ── Completed orders ──────────────────────────────────────────────────────
  const completedOrders = useMemo(() => rawOrders.filter(o => o.status === 'completed'), [rawOrders])

  // ── Overview: summary stats ───────────────────────────────────────────────
  const gross = useMemo(() => completedOrders.reduce((s, o) => s + Number(o.total), 0), [completedOrders])
  const orderCount = completedOrders.length
  const avgOrder = orderCount > 0 ? gross / orderCount : 0
  const uniqueStudents = useMemo(() => new Set(completedOrders.filter(o => o.bochur_id).map(o => o.bochur_id)).size, [completedOrders])

  // ── Overview: daily revenue ───────────────────────────────────────────────
  const dailyRevenue = useMemo(() => {
    const { fromISO, toISO } = resolveISO()
    const map: Record<string, number> = {}
    for (const o of completedOrders) { const k = o.created_at.split('T')[0]; map[k] = (map[k] || 0) + Number(o.total) }
    const result: { date: string; revenue: number }[] = []
    const cur = new Date(fromISO)
    const end = new Date(toISO)
    while (cur < end) {
      const key = cur.toISOString().split('T')[0]
      const label = new Date(key + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      result.push({ date: label, revenue: map[key] || 0 })
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedOrders, range, customFrom, customTo])

  // ── Overview: hourly heatmap ───────────────────────────────────────────────
  const hourlyData = useMemo(() => {
    const map: Record<number, { revenue: number; count: number }> = {}
    for (let h = 0; h < 24; h++) map[h] = { revenue: 0, count: 0 }
    for (const o of completedOrders) {
      const h = new Date(o.created_at).getUTCHours()
      map[h].revenue += Number(o.total); map[h].count += 1
    }
    return Array.from({ length: 24 }, (_, i) => ({
      label: HOUR_LABELS[i], revenue: map[i].revenue, count: map[i].count,
    }))
  }, [completedOrders])

  // ── Overview: day of week ─────────────────────────────────────────────────
  const dowData = useMemo(() => {
    const map: Record<number, { revenue: number; count: number }> = {}
    for (let i = 0; i < 7; i++) map[i] = { revenue: 0, count: 0 }
    for (const o of completedOrders) {
      const d = new Date(o.created_at).getUTCDay()
      map[d].revenue += Number(o.total); map[d].count += 1
    }
    return [1, 2, 3, 4, 5, 6, 0].map(i => ({
      day: DOW_LABELS[i], revenue: map[i].revenue, avg: map[i].count > 0 ? map[i].revenue / map[i].count : 0,
    }))
  }, [completedOrders])

  // ── Overview: payment methods ─────────────────────────────────────────────
  const paymentData = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of rawPayments) {
      const label = METHOD_LABELS[p.method] || p.method || 'Other'
      map[label] = (map[label] || 0) + p.amount
    }
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [rawPayments])

  // ── Overview: cashier stats ───────────────────────────────────────────────
  const cashierStats = useMemo(() => {
    const map: Record<string, { orders: number; revenue: number }> = {}
    for (const o of completedOrders) {
      const name = (o.cashier_profiles as any)?.name || 'Unknown'
      if (!map[name]) map[name] = { orders: 0, revenue: 0 }
      map[name].orders += 1; map[name].revenue += Number(o.total)
    }
    return Object.entries(map)
      .map(([name, d]) => ({ name, ...d, avg: d.orders > 0 ? d.revenue / d.orders : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [completedOrders])

  // ── Overview: new vs returning ────────────────────────────────────────────
  const { fromISO: _fromISO, toISO: _toISO } = resolveISO()
  const customerStats = useMemo(() => {
    const { fromISO, toISO } = resolveISO()
    const firstOrder: Record<string, string> = {}
    for (const o of allHistoricOrders) {
      if (!firstOrder[o.bochur_id] || o.created_at < firstOrder[o.bochur_id]) firstOrder[o.bochur_id] = o.created_at
    }
    let newC = 0, returningC = 0
    for (const bid of Array.from(bochurimInRange)) {
      if (firstOrder[bid] >= fromISO && firstOrder[bid] < toISO) newC++
      else returningC++
    }
    return { new: newC, returning: returningC }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allHistoricOrders, bochurimInRange, _fromISO, _toISO])

  // ── Products: top sellers (filtered by category) ──────────────────────────
  const topSellers = useMemo(() => {
    const map: Record<string, { name: string; units: number; revenue: number }> = {}
    for (const item of filteredItems) {
      const key = `${item.product_id ?? item.product_name}|${item.variant_label ?? ''}`
      if (!map[key]) {
        const displayName = item.variant_label ? `${item.product_name} (${item.variant_label})` : item.product_name
        map[key] = { name: displayName, units: 0, revenue: 0 }
      }
      map[key].units += item.quantity; map[key].revenue += Number(item.total)
    }
    return Object.values(map).sort((a, b) => b.units - a.units).slice(0, 10)
  }, [filteredItems])

  const bottomSellers = useMemo(() =>
    Object.values(
      filteredItems.reduce((acc: Record<string, { name: string; units: number; revenue: number }>, item) => {
        const key = `${item.product_id ?? item.product_name}|${item.variant_label ?? ''}`
        if (!acc[key]) {
          acc[key] = { name: item.variant_label ? `${item.product_name} (${item.variant_label})` : item.product_name, units: 0, revenue: 0 }
        }
        acc[key].units += item.quantity; acc[key].revenue += Number(item.total)
        return acc
      }, {})
    ).filter(p => p.units > 0).sort((a, b) => a.units - b.units).slice(0, 10)
  , [filteredItems])

  // ── Products: category revenue (always uses all items) ────────────────────
  const categoryRevenue = useMemo(() => {
    const map: Record<string, { revenue: number; units: number }> = {}
    for (const item of rawItems) {
      const cat = (item.products as any)?.product_categories?.[0]?.categories?.name || 'Uncategorised'
      if (!map[cat]) map[cat] = { revenue: 0, units: 0 }
      map[cat].revenue += Number(item.total); map[cat].units += item.quantity
    }
    return Object.entries(map).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.revenue - a.revenue)
  }, [rawItems])

  // ── Products: FBT pairs ────────────────────────────────────────────────────
  const fbtPairs = useMemo(() => {
    const orderProducts: Record<string, { id: string; name: string }[]> = {}
    for (const item of filteredItems) {
      const oid = (item.orders as any)?.id || item.order_id
      if (!oid) continue
      if (!orderProducts[oid]) orderProducts[oid] = []
      const key = `${item.product_id ?? item.product_name}|${item.variant_label ?? ''}`
      const name = item.variant_label ? `${item.product_name} (${item.variant_label})` : item.product_name
      orderProducts[oid].push({ id: key, name })
    }
    const counts: Record<string, { a: string; b: string; count: number }> = {}
    for (const prods of Object.values(orderProducts)) {
      const unique = Array.from(new Map(prods.map(p => [p.id, p])).values())
      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          const [pa, pb] = unique[i].name <= unique[j].name ? [unique[i], unique[j]] : [unique[j], unique[i]]
          const key = `${pa.id}||${pb.id}`
          if (!counts[key]) counts[key] = { a: pa.name, b: pb.name, count: 0 }
          counts[key].count++
        }
      }
    }
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 10)
  }, [filteredItems])

  // ── Profit: financial totals ───────────────────────────────────────────────
  const cogs = useMemo(() =>
    rawItems.reduce((s, item) => s + Number((item.products as any)?.cost_price || 0) * item.quantity, 0)
  , [rawItems])

  const cogsBreakdown = useMemo(() => {
    const map: Record<string, { name: string; units: number; costPerUnit: number; total: number }> = {}
    for (const item of rawItems) {
      const cost = Number((item.products as any)?.cost_price || 0)
      if (cost <= 0) continue
      const key = `${item.product_id ?? item.product_name}|${item.variant_label ?? ''}`
      const name = item.variant_label ? `${item.product_name} (${item.variant_label})` : item.product_name
      if (!map[key]) map[key] = { name, units: 0, costPerUnit: cost, total: 0 }
      map[key].units += item.quantity; map[key].total += cost * item.quantity
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [rawItems])

  const net = gross - cogs - expenses - wastageTotal
  const margin = gross > 0 ? (net / gross) * 100 : 0

  // ── Students: top spenders ────────────────────────────────────────────────
  const topSpenders = useMemo(() => {
    const map: Record<string, { name: string; total: number; orders: number }> = {}
    for (const o of completedOrders) {
      if (!o.bochur_id) continue
      const name = (o.bochurim as any)?.name || 'Unknown'
      if (!map[o.bochur_id]) map[o.bochur_id] = { name, total: 0, orders: 0 }
      map[o.bochur_id].total += Number(o.total); map[o.bochur_id].orders += 1
    }
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 15)
  }, [completedOrders])

  // ── Students: visit frequency ──────────────────────────────────────────────
  const visitFrequency = useMemo(() => {
    const { fromISO, toISO } = resolveISO()
    const counts: Record<string, number> = {}
    for (const o of allHistoricOrders) {
      if (o.created_at >= fromISO && o.created_at < toISO) {
        counts[o.bochur_id] = (counts[o.bochur_id] || 0) + 1
      }
    }
    let f1 = 0, f2to5 = 0, f6plus = 0
    for (const c of Object.values(counts)) {
      if (c === 1) f1++; else if (c <= 5) f2to5++; else f6plus++
    }
    return [{ bucket: '1 visit', count: f1 }, { bucket: '2–5 visits', count: f2to5 }, { bucket: '6+ visits', count: f6plus }]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allHistoricOrders, _fromISO, _toISO])

  // ── Students: account type revenue ────────────────────────────────────────
  const accountTypeRevenue = useMemo(() => {
    const map: Record<string, number> = {}
    for (const o of completedOrders) {
      const at = (o.bochurim as any)?.account_types?.name || (o.bochur_id ? 'No Type' : 'Walk-in')
      map[at] = (map[at] || 0) + Number(o.total)
    }
    return Object.entries(map).map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue)
  }, [completedOrders])

  // ── Voids/refunds ────────────────────────────────────────────────────────
  const voidStats = useMemo(() => {
    const voided = rawOrders.filter(o => o.status === 'voided').length
    const refunded = rawOrders.filter(o => o.status === 'refunded').length
    const total = rawOrders.length
    return { voided, refunded, total, rate: total > 0 ? ((voided + refunded) / total) * 100 : 0 }
  }, [rawOrders])

  // ── Presets ───────────────────────────────────────────────────────────────
  function applyPreset(preset: Exclude<DateRange, 'custom'>) {
    const { from, to } = getDateRange(preset)
    setRange(preset)
    setCustomFrom(fmtDate(from))
    const todisplay = new Date(to); todisplay.setUTCDate(todisplay.getUTCDate() - 1)
    setCustomTo(fmtDate(todisplay))
  }

  // ── CSV export ────────────────────────────────────────────────────────────
  async function exportCSV() {
    setExporting(true)
    try {
      const { fromISO, toISO } = resolveISO()
      const { data } = await supabase
        .from('orders')
        .select('id, created_at, total, bochurim!bochur_id(name), cashier_profiles!cashier_id(name), payments(method, amount)')
        .eq('status', 'completed').gte('created_at', fromISO).lt('created_at', toISO)
        .order('created_at', { ascending: true })
      if (!data?.length) { alert('No orders found in this date range.'); return }
      const rows = (data as any[]).map(o => {
        const d = new Date(o.created_at)
        const methods = Array.isArray(o.payments) ? o.payments.map((p: any) => p.method).join('/') : ''
        return [d.toLocaleDateString('en-US'), d.toLocaleTimeString('en-US'), o.id,
          `"${o.bochurim?.name || 'Walk-in'}"`, `"${o.cashier_profiles?.name || ''}"`,
          `"${methods}"`, Number(o.total).toFixed(2)].join(',')
      })
      const csv = ['Date,Time,Order ID,Student,Cashier,Payment Method,Total', ...rows].join('\n')
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
        download: `canteen-${customFrom}-to-${customTo}.csv`,
      })
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
    } finally { setExporting(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { id: 'products', label: 'Products', icon: <ShoppingBag className="w-3.5 h-3.5" /> },
    { id: 'profit', label: 'Profit & COGS', icon: <DollarSign className="w-3.5 h-3.5" /> },
    { id: 'students', label: 'Students', icon: <Users className="w-3.5 h-3.5" /> },
  ]
  const PRESETS: { value: Exclude<DateRange, 'custom'>; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'this_week', label: 'Week' },
    { value: 'this_month', label: 'Month' },
    { value: 'last_30', label: '30 Days' },
  ]

  return (
    <div className="min-h-screen bg-slate-50/50">
      {/* ── Sticky header ──────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* Top row */}
          <div className="flex items-center justify-between py-3 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <BarChart2 className="w-5 h-5 text-indigo-500 shrink-0" />
              <h1 className="text-base font-bold text-slate-900 tracking-tight truncate">Reports</h1>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Preset buttons */}
              <div className="hidden sm:flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
                {PRESETS.map(p => (
                  <button key={p.value} onClick={() => applyPreset(p.value)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${range === p.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Custom date pickers */}
              <div className="flex items-center gap-1.5 text-xs">
                <input type="date" value={customFrom}
                  onChange={e => { setCustomFrom(e.target.value); setRange('custom') }}
                  className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400" />
                <span className="text-slate-400">–</span>
                <input type="date" value={customTo}
                  onChange={e => { setCustomTo(e.target.value); setRange('custom') }}
                  className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400" />
              </div>

              <button onClick={fetchData} title="Refresh"
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button onClick={exportCSV} disabled={exporting || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all">
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export CSV</span>
              </button>
            </div>
          </div>

          {/* Tab row */}
          <div className="flex items-center gap-1 -mb-px">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
                  tab === t.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── OVERVIEW TAB ─────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <>
            {/* Summary strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {loading ? Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="p-5"><Skeleton h={52} /></Card>
              )) : <>
                <StatCard label="Total Revenue" value={formatCurrency(gross)} sub={`${orderCount} orders`} color="slate" />
                <StatCard label="Avg Order" value={formatCurrency(avgOrder)} sub="per completed order" color="indigo" />
                <StatCard label="Unique Students" value={String(uniqueStudents)} sub={`${customerStats.new} new · ${customerStats.returning} returning`} color="slate" />
                <StatCard label="Void / Refund Rate" value={`${voidStats.rate.toFixed(1)}%`} sub={`${voidStats.voided} voided · ${voidStats.refunded} refunded`} color={voidStats.rate > 5 ? 'red' : 'slate'} />
              </>}
            </div>

            {/* Daily revenue chart */}
            <Card>
              <CardHeader title="Daily Revenue" sub={`${dailyRevenue.length} days`} />
              <div className="p-5">
                {loading ? <Skeleton /> : dailyRevenue.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-10">No orders in this period</p>
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

            {/* Hourly + Day of Week side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader title="Revenue by Hour" sub="Completed orders" />
                <div className="p-5">
                  {loading ? <Skeleton /> : (
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
                <CardHeader title="Revenue by Day of Week" />
                <div className="p-5">
                  {loading ? <Skeleton /> : (
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader title="Payment Methods" />
                <div className="p-5">
                  {loading ? <Skeleton /> : paymentData.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-10">No payment data</p>
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
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: C[i % C.length] }} />
                              <span className="text-sm text-slate-600 truncate">{p.name}</span>
                            </div>
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
                          <Pie
                            data={[{ name: 'New', value: customerStats.new }, { name: 'Returning', value: customerStats.returning }]}
                            cx="50%" cy="50%" innerRadius={40} outerRadius={62} dataKey="value" paddingAngle={2}
                          >
                            <Cell fill={C[2]} /><Cell fill={C[0]} />
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: C[2] }} />
                            <span className="text-xs text-slate-500 font-medium">New</span>
                          </div>
                          <p className="text-2xl font-bold text-slate-900 ml-4">{customerStats.new}</p>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: C[0] }} />
                            <span className="text-xs text-slate-500 font-medium">Returning</span>
                          </div>
                          <p className="text-2xl font-bold text-slate-900 ml-4">{customerStats.returning}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Cashier stats table */}
            {!loading && cashierStats.length > 0 && (
              <Card>
                <CardHeader title="Cashier Performance" />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        {['Cashier', 'Orders', 'Revenue', 'Avg Order'].map(h => (
                          <th key={h} className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {cashierStats.map((c, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3 text-sm font-medium text-slate-800">{c.name}</td>
                          <td className="px-5 py-3 text-sm text-slate-600">{c.orders}</td>
                          <td className="px-5 py-3 text-sm font-semibold text-emerald-600">{formatCurrency(c.revenue)}</td>
                          <td className="px-5 py-3 text-sm text-slate-600">{formatCurrency(c.avg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}

        {/* ── PRODUCTS TAB ─────────────────────────────────────────────── */}
        {tab === 'products' && (
          <>
            {/* Category filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide shrink-0">Filter:</span>
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${!selectedCategory ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'}`}
              >All Categories</button>
              {allCategories.map(cat => (
                <button key={cat} onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${selectedCategory === cat ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'}`}>
                  {cat}
                </button>
              ))}
            </div>

            {/* Category revenue pie + table */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader title="Revenue by Category" />
                <div className="p-5">
                  {loading ? <Skeleton /> : categoryRevenue.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-10">No data</p>
                  ) : (
                    <div className="space-y-3">
                      {categoryRevenue.map((cat, i) => {
                        const pct = gross > 0 ? (cat.revenue / gross) * 100 : 0
                        return (
                          <div key={cat.name}>
                            <div className="flex items-center justify-between mb-1">
                              <button onClick={() => setSelectedCategory(cat.name === selectedCategory ? null : cat.name)}
                                className="flex items-center gap-2 group">
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

              {/* Top sellers chart */}
              <Card className="lg:col-span-3">
                <CardHeader title={selectedCategory ? `Top Products — ${selectedCategory}` : 'Top 10 Products'} sub="By units sold" />
                <div className="p-5">
                  {loading ? <Skeleton h={260} /> : topSellers.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-10">No sales data</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(220, topSellers.length * 34)}>
                      <BarChart data={topSellers} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} axisLine={false} width={130} />
                        <Tooltip content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null
                          const d = payload[0]?.payload
                          return (
                            <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-xs">
                              <p className="font-semibold text-slate-700 mb-1">{label}</p>
                              <p className="text-emerald-600">{d.units} units</p>
                              <p className="text-slate-500">{formatCurrency(d.revenue)} revenue</p>
                            </div>
                          )
                        }} />
                        <Bar dataKey="units" name="Units" fill={C[1]} radius={[0, 3, 3, 0]}
                          label={{ position: 'right', fontSize: 10, fill: '#94a3b8' }} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>
            </div>

            {/* Bottom sellers */}
            {!loading && bottomSellers.length > 0 && (
              <Card>
                <CardHeader title={selectedCategory ? `Slowest Sellers — ${selectedCategory}` : 'Slowest Sellers'} sub="Fewest units sold" />
                <div className="p-5">
                  <ResponsiveContainer width="100%" height={Math.max(180, bottomSellers.length * 30)}>
                    <BarChart data={bottomSellers} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} axisLine={false} width={130} />
                      <Tooltip content={<CurrencyTip />} />
                      <Bar dataKey="units" name="Units" fill={C[3]} radius={[0, 3, 3, 0]}
                        label={{ position: 'right', fontSize: 10, fill: '#94a3b8' }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {/* FBT pairs */}
            {!loading && fbtPairs.length > 0 && (
              <Card>
                <CardHeader title="Frequently Bought Together" sub="Most common product pairs" />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Product A</th>
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Product B</th>
                        <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Times Together</th>
                      </tr>
                    </thead>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {loading ? Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="p-5"><Skeleton h={52} /></Card>
              )) : <>
                <StatCard label="Gross Sales" value={formatCurrency(gross)} color="slate" />
                <StatCard label="Product COGS" value={formatCurrency(cogs)} color="amber" />
                <StatCard label="Expenses" value={formatCurrency(expenses)} color="red" />
                <StatCard label="Wastage" value={formatCurrency(wastageTotal)} color="red" />
                <StatCard label="Net Profit" value={formatCurrency(net)} color={net >= 0 ? 'emerald' : 'red'} sub={`${margin.toFixed(1)}% margin`} />
                <Card className="p-5 sm:col-span-3 lg:col-span-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Breakdown</p>
                  <div className="mt-2 space-y-1">
                    {gross > 0 && [
                      { label: 'COGS', value: cogs, color: '#f59e0b' },
                      { label: 'Exp', value: expenses, color: '#ef4444' },
                      { label: 'Waste', value: wastageTotal, color: '#f97316' },
                    ].map(row => (
                      <div key={row.label} className="flex items-center gap-1.5">
                        <div className="h-1.5 rounded-full" style={{ width: `${Math.max(4, (row.value / gross) * 100)}%`, background: row.color }} />
                        <span className="text-xs text-slate-400">{row.label} {((row.value / gross) * 100).toFixed(0)}%</span>
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
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        {['Product', 'Units Sold', 'Cost / Unit', 'Total Cost'].map(h => (
                          <th key={h} className={`text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3 ${h === 'Product' ? 'text-left' : 'text-right'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {cogsBreakdown.map((row, i) => (
                        <tr key={i} className={`hover:bg-slate-50/50 transition-colors ${i % 2 === 1 ? 'bg-slate-50/30' : ''}`}>
                          <td className="px-5 py-2.5 text-sm font-medium text-slate-700">{row.name}</td>
                          <td className="px-5 py-2.5 text-sm text-slate-600 text-right">{row.units}</td>
                          <td className="px-5 py-2.5 text-sm text-slate-600 text-right">{formatCurrency(row.costPerUnit)}</td>
                          <td className="px-5 py-2.5 text-sm font-semibold text-amber-600 text-right">{formatCurrency(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200">
                        <td colSpan={3} className="px-5 pt-3 text-xs font-semibold text-slate-500 uppercase">Total</td>
                        <td className="px-5 pt-3 text-right font-bold text-amber-600">{formatCurrency(cogsBreakdown.reduce((s, r) => s + r.total, 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            )}

            {/* Expenses + Wastage side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader title="Expense Entries" sub={`${formatCurrency(expenses)} total`} />
                <div className="overflow-y-auto max-h-80">
                  {loading ? <div className="p-5"><Skeleton h={120} /></div> : expenseItems.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">No expenses in this period</p>
                  ) : (
                    <table className="w-full">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-slate-100">
                          <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-2.5">Description</th>
                          <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2.5">Type</th>
                          <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-2.5">Amount</th>
                        </tr>
                      </thead>
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
                <CardHeader title="Wastage Log" sub={`${formatCurrency(wastageTotal)} in waste cost`} />
                <div className="overflow-y-auto max-h-80">
                  {loading ? <div className="p-5"><Skeleton h={120} /></div> : wastageItems.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">No wastage logged in this period</p>
                  ) : (
                    <table className="w-full">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-slate-100">
                          <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-2.5">Product</th>
                          <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2.5">Qty</th>
                          <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2.5">Reason</th>
                          <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-2.5">Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {wastageItems.map((w, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-2.5 text-sm text-slate-700">{w.product_name}</td>
                            <td className="px-3 py-2.5 text-sm text-slate-600">{w.quantity}</td>
                            <td className="px-3 py-2.5 text-xs text-slate-500 max-w-[120px] truncate">{w.reason || '—'}</td>
                            <td className="px-5 py-2.5 text-sm font-semibold text-orange-500 text-right">
                              {formatCurrency(Number(w.unit_cost || 0) * w.quantity)}
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
            {/* Account type revenue */}
            {!loading && accountTypeRevenue.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader title="Revenue by Account Type" />
                  <div className="p-5">
                    <div className="space-y-3">
                      {accountTypeRevenue.map((at, i) => {
                        const pct = gross > 0 ? (at.revenue / gross) * 100 : 0
                        return (
                          <div key={at.name}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: C[i % C.length] }} />
                                <span className="text-sm text-slate-700 font-medium">{at.name}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-semibold text-slate-800">{formatCurrency(at.revenue)}</span>
                                <span className="text-xs text-slate-400 ml-1.5">{pct.toFixed(0)}%</span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: C[i % C.length] }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </Card>

                <Card>
                  <CardHeader title="Visit Frequency" sub="Students by number of visits" />
                  <div className="p-5">
                    {loading ? <Skeleton /> : (
                      <div className="space-y-4">
                        {visitFrequency.map((vf, i) => {
                          const total = visitFrequency.reduce((s, f) => s + f.count, 0)
                          const pct = total > 0 ? (vf.count / total) * 100 : 0
                          return (
                            <div key={vf.bucket}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm text-slate-600 font-medium">{vf.bucket}</span>
                                <span className="text-sm font-bold text-slate-800">{vf.count} students</span>
                              </div>
                              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: C[i] }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            )}

            {/* Top spenders */}
            <Card>
              <CardHeader title="Top Spenders" sub="By total spend in period" />
              {loading ? (
                <div className="p-5"><Skeleton h={300} /></div>
              ) : topSpenders.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-10">No student orders in this period</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3 w-8">#</th>
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Student</th>
                        <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Orders</th>
                        <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Total Spent</th>
                        <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Avg Order</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {topSpenders.map((s, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-2.5 text-xs font-bold text-slate-400">{i + 1}</td>
                          <td className="px-5 py-2.5 text-sm font-medium text-slate-800">{s.name}</td>
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
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Student</th>
                        <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Balance</th>
                        <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Last Order</th>
                        <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Active in Period</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {unspentCredits.map((b, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-2.5 text-sm font-medium text-slate-800">{b.name}</td>
                          <td className="px-5 py-2.5 text-sm font-bold text-emerald-600 text-right">{formatCurrency(b.balance)}</td>
                          <td className="px-5 py-2.5 text-xs text-slate-500 text-right">
                            {b.lastOrder ? new Date(b.lastOrder).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Never'}
                          </td>
                          <td className="px-5 py-2.5 text-right">
                            {bochurimInRange.has(b.id) ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">Yes</span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">No</span>
                            )}
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
    </div>
  )
}
