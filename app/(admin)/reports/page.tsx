'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────

type DateRange = 'today' | 'this_week' | 'this_month' | 'last_30' | 'custom'

interface HourlyData {
  hour: number
  label: string
  revenue: number
  transactions: number
}

interface TopProduct {
  name: string
  units: number
  revenue: number
}

interface CategoryData {
  name: string
  revenue: number
}

interface PaymentData {
  name: string
  value: number
}

interface CashierData {
  name: string
  orders: number
  revenue: number
  avg: number
}

interface FinancialData {
  gross: number
  cogs: number
  expenses: number
  wastage: number
  net: number
  margin: number
}

interface VoidData {
  completed: number
  voided: number
  refunded: number
  total: number
  rate: number
}

interface StockData {
  name: string
  value: number
}

interface CustomerData {
  newCustomers: number
  returning: number
}

interface ProductPair {
  a: string
  b: string
  count: number
}

interface BochurCredit {
  id: string
  name: string
  bochur_number: string | null
  balance: number
  lastOrderDate: string | null
  seenRecently: boolean
}

interface DailyAvgOrder {
  date: string
  avg: number
  count: number
}

interface AccountTypeRevData {
  name: string
  revenue: number
}

interface VisitFreqData {
  bucket: string
  count: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDateRangeForPreset(range: Exclude<DateRange, 'custom'>): { from: Date; to: Date } {
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))

  if (range === 'today') {
    return { from: today, to }
  }
  if (range === 'this_week') {
    const day = now.getUTCDay()
    const monday = new Date(today)
    monday.setUTCDate(today.getUTCDate() - ((day + 6) % 7))
    return { from: monday, to }
  }
  if (range === 'this_month') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    return { from, to }
  }
  // last_30
  const from = new Date(today)
  from.setUTCDate(from.getUTCDate() - 30)
  return { from, to }
}

function todayStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function daysAgoStr(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  if (i === 0) return '12a'
  if (i < 12) return `${i}a`
  if (i === 12) return '12p'
  return `${i - 12}p`
})

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
const METHOD_LABELS: Record<string, string> = {
  balance: 'Balance',
  cash: 'Cash',
  credit_card: 'Credit Card',
  card: 'Credit Card',
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ChartSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div
      className="animate-pulse bg-slate-100 rounded-xl w-full"
      style={{ height }}
    />
  )
}

function StatSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-4 bg-slate-100 rounded w-24" />
      <div className="h-8 bg-slate-100 rounded w-32" />
    </div>
  )
}

// ─── Section card wrapper ──────────────────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{title}</h2>
        {subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ─── Custom tooltip ────────────────────────────────────────────────────────────

function CurrencyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {entry.name?.toLowerCase().includes('revenue') || entry.name?.toLowerCase().includes('gross') || entry.name?.toLowerCase().includes('net') || entry.name?.toLowerCase().includes('cogs') || entry.name?.toLowerCase().includes('avg')
            ? formatCurrency(entry.value)
            : entry.value}
        </p>
      ))}
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const supabase = createClient()
  const [range, setRange] = useState<DateRange>('last_30')
  const [customFrom, setCustomFrom] = useState<string>(daysAgoStr(30))
  const [customTo, setCustomTo] = useState<string>(todayStr())
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const [hourly, setHourly] = useState<HourlyData[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [categories, setCategories] = useState<CategoryData[]>([])
  const [payments, setPayments] = useState<PaymentData[]>([])
  const [cashiers, setCashiers] = useState<CashierData[]>([])
  const [financial, setFinancial] = useState<FinancialData | null>(null)
  const [voids, setVoids] = useState<VoidData | null>(null)
  const [stock, setStock] = useState<StockData[]>([])
  const [customers, setCustomers] = useState<CustomerData | null>(null)
  const [bottomSellers, setBottomSellers] = useState<TopProduct[]>([])
  const [pairs, setPairs] = useState<ProductPair[]>([])
  const [credits, setCredits] = useState<BochurCredit[]>([])
  const [dailyAvgOrder, setDailyAvgOrder] = useState<DailyAvgOrder[]>([])
  const [accountTypeRevenue, setAccountTypeRevenue] = useState<AccountTypeRevData[]>([])
  const [visitFrequency, setVisitFrequency] = useState<VisitFreqData[]>([])
  const [dailyRevenue, setDailyRevenue] = useState<{ date: string; revenue: number }[]>([])
  const [dayOfWeekRevenue, setDayOfWeekRevenue] = useState<{ day: string; revenue: number; count: number; avg: number }[]>([])
  const [categoriesDetail, setCategoriesDetail] = useState<{ name: string; revenue: number; quantity: number }[]>([])
  const [topSpenders, setTopSpenders] = useState<{ name: string; total: number }[]>([])
  const [cogsBreakdown, setCogsBreakdown] = useState<{ name: string; units: number; costPerUnit: number; total: number }[]>([])

  function resolveRange(): { fromISO: string; toISO: string } {
    if (range === 'custom') {
      const from = customFrom || daysAgoStr(30)
      const to = customTo || todayStr()
      return {
        fromISO: from + 'T00:00:00.000Z',
        toISO: to + 'T23:59:59.999Z',
      }
    }
    const { from, to } = getDateRangeForPreset(range as Exclude<DateRange, 'custom'>)
    return { fromISO: from.toISOString(), toISO: to.toISOString() }
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { fromISO, toISO } = resolveRange()

    const [
      ordersRes,
      orderItemsRes,
      paymentsRes,
      productsRes,
      allOrdersForCustomers,
      accountTypeOrdersRes,
      expensesRes,
      wastageRes,
    ] = await Promise.all([
      // All orders in range (any status) for void/refund stats + bochur name for CSV
      supabase
        .from('orders')
        .select('id, status, total, bochur_id, created_at, cashier_profiles!cashier_id(name), bochurim!bochur_id(name)')
        .gte('created_at', fromISO)
        .lt('created_at', toISO),

      // Order items for completed orders in range — join through orders
      supabase
        .from('order_items')
        .select('order_id, product_id, product_name, variant_label, quantity, unit_price, total, orders!inner(id, created_at, status), products(cost_price, product_categories(categories(name)))')
        .eq('orders.status', 'completed')
        .gte('orders.created_at', fromISO)
        .lt('orders.created_at', toISO),

      // Payments in range
      supabase
        .from('payments')
        .select('method, amount, status')
        .gte('created_at', fromISO)
        .lt('created_at', toISO),

      // All active products for stock chart
      supabase
        .from('products')
        .select('id, stock_quantity, low_stock_threshold')
        .eq('is_active', true),

      // All historical orders for returning-customer logic
      supabase
        .from('orders')
        .select('bochur_id, created_at')
        .eq('status', 'completed')
        .not('bochur_id', 'is', null),

      // Orders with account type info for revenue-by-account-type chart
      supabase
        .from('orders')
        .select('total, bochur_id, bochurim!bochur_id(account_types(name))')
        .eq('status', 'completed')
        .gte('created_at', fromISO)
        .lt('created_at', toISO),

      // Expense entries in range
      supabase
        .from('expense_entries')
        .select('amount')
        .gte('date', fromISO.split('T')[0])
        .lte('date', toISO.split('T')[0]),

      // Wastage log in range
      supabase
        .from('wastage_log')
        .select('quantity, unit_cost')
        .gte('created_at', fromISO)
        .lt('created_at', toISO),
    ])

    // ── 1 & 2: Hourly heatmap + line graph ──────────────────────────────────

    const hourlyMap: Record<number, { revenue: number; count: number }> = {}
    for (let h = 0; h < 24; h++) hourlyMap[h] = { revenue: 0, count: 0 }

    const completedOrders = (ordersRes.data || []).filter((o: any) => o.status === 'completed')
    for (const order of completedOrders) {
      const h = new Date(order.created_at).getUTCHours()
      hourlyMap[h].revenue += Number(order.total)
      hourlyMap[h].count += 1
    }

    const hourlyData: HourlyData[] = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: HOUR_LABELS[i],
      revenue: hourlyMap[i].revenue,
      transactions: hourlyMap[i].count,
    }))
    setHourly(hourlyData)

    // ── 3: Top 10 products ────────────────────────────────────────────────────

    const productMap: Record<string, { name: string; units: number; revenue: number }> = {}
    for (const item of (orderItemsRes.data || []) as any[]) {
      const key = `${item.product_id || item.product_name}|${item.variant_label || ''}`
      if (!productMap[key]) {
        const displayName = item.variant_label
          ? `${item.product_name} (${item.variant_label})`
          : item.product_name
        productMap[key] = { name: displayName, units: 0, revenue: 0 }
      }
      productMap[key].units += item.quantity
      productMap[key].revenue += Number(item.total)
    }
    const top10 = Object.values(productMap)
      .sort((a, b) => b.units - a.units)
      .slice(0, 10)
    setTopProducts(top10)

    // ── 4: Sales by category ──────────────────────────────────────────────────

    const catMap: Record<string, number> = {}
    for (const item of (orderItemsRes.data || []) as any[]) {
      const catName =
        (item.products as any)?.product_categories?.[0]?.categories?.name ||
        'Uncategorised'
      catMap[catName] = (catMap[catName] || 0) + Number(item.total)
    }
    const catData = Object.entries(catMap)
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
    setCategories(catData)

    // ── 5: Payment method breakdown ───────────────────────────────────────────

    const payMap: Record<string, number> = {}
    for (const p of (paymentsRes.data || []) as any[]) {
      if (p.status !== 'completed' && p.status !== null && p.status !== undefined) continue
      const label = METHOD_LABELS[p.method] || p.method || 'Other'
      payMap[label] = (payMap[label] || 0) + Number(p.amount)
    }
    const payData = Object.entries(payMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
    setPayments(payData)

    // ── 6: Sales by cashier ───────────────────────────────────────────────────

    const cashierMap: Record<string, { orders: number; revenue: number }> = {}
    for (const order of completedOrders) {
      const name = (order.cashier_profiles as any)?.name || 'Unknown'
      if (!cashierMap[name]) cashierMap[name] = { orders: 0, revenue: 0 }
      cashierMap[name].orders += 1
      cashierMap[name].revenue += Number(order.total)
    }
    const cashierData: CashierData[] = Object.entries(cashierMap)
      .map(([name, d]) => ({ name, orders: d.orders, revenue: d.revenue, avg: d.orders > 0 ? d.revenue / d.orders : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
    setCashiers(cashierData)

    // ── 7: Gross vs Net ────────────────────────────────────────────────────────

    const gross = completedOrders.reduce((s: number, o: any) => s + Number(o.total), 0)
    let cogs = 0
    // Build COGS breakdown by product (using products.cost_price JOIN)
    const cogsMap: Record<string, { name: string; units: number; costPerUnit: number; total: number }> = {}
    for (const item of (orderItemsRes.data || []) as any[]) {
      const cost = Number((item.products as any)?.cost_price || 0)
      cogs += cost * item.quantity
      if (cost > 0) {
        const displayName = item.variant_label
          ? `${item.product_name} (${item.variant_label})`
          : item.product_name
        const key = `${item.product_id || item.product_name}|${item.variant_label || ''}`
        if (!cogsMap[key]) cogsMap[key] = { name: displayName, units: 0, costPerUnit: cost, total: 0 }
        cogsMap[key].units += item.quantity
        cogsMap[key].total += cost * item.quantity
      }
    }
    const cogsBreakdownData = Object.values(cogsMap).sort((a, b) => b.total - a.total)
    setCogsBreakdown(cogsBreakdownData)
    const expenses = (expensesRes.data || []).reduce((s: number, e: any) => s + Number(e.amount), 0)
    const wastage = (wastageRes.data || []).reduce((s: number, w: any) => s + Number(w.unit_cost || 0) * Number(w.quantity), 0)
    const net = gross - cogs - expenses - wastage
    const margin = gross > 0 ? (net / gross) * 100 : 0
    setFinancial({ gross, cogs, expenses, wastage, net, margin })

    // ── 8: Void & refund rate ─────────────────────────────────────────────────

    const allOrders = ordersRes.data || []
    const voidedCount = allOrders.filter((o: any) => o.status === 'voided').length
    const refundedCount = allOrders.filter((o: any) => o.status === 'refunded').length
    const totalCount = allOrders.length
    const rate = totalCount > 0 ? ((voidedCount + refundedCount) / totalCount) * 100 : 0
    setVoids({
      completed: completedOrders.length,
      voided: voidedCount,
      refunded: refundedCount,
      total: totalCount,
      rate,
    })

    // ── 9: Stock donut ────────────────────────────────────────────────────────

    const products = productsRes.data || []
    let healthy = 0, low = 0, out = 0
    for (const p of products as any[]) {
      if (p.stock_quantity <= 0) out++
      else if (p.stock_quantity <= (p.low_stock_threshold || 0)) low++
      else healthy++
    }
    setStock([
      { name: 'Healthy', value: healthy },
      { name: 'Low Stock', value: low },
      { name: 'Out of Stock', value: out },
    ])

    // ── 10: New vs returning customers ────────────────────────────────────────

    const allBochurOrders = allOrdersForCustomers.data || []
    const firstOrderDate: Record<string, string> = {}
    for (const o of allBochurOrders as any[]) {
      const bid = o.bochur_id
      if (!firstOrderDate[bid] || o.created_at < firstOrderDate[bid]) {
        firstOrderDate[bid] = o.created_at
      }
    }
    let newC = 0, returningC = 0
    const bochurimInRange = new Set<string>()
    for (const o of allBochurOrders as any[]) {
      if (o.created_at >= fromISO && o.created_at < toISO) {
        bochurimInRange.add(o.bochur_id)
      }
    }
    for (const bid of Array.from(bochurimInRange)) {
      if (firstOrderDate[bid] >= fromISO && firstOrderDate[bid] < toISO) {
        newC++
      } else {
        returningC++
      }
    }
    setCustomers({ newCustomers: newC, returning: returningC })

    // ── 11: Bottom sellers ────────────────────────────────────────────────────

    const bottom10 = Object.values(productMap)
      .filter(p => p.units > 0)
      .sort((a, b) => a.units - b.units)
      .slice(0, 10)
    setBottomSellers(bottom10)

    // ── 12: Frequently bought together ────────────────────────────────────────

    const orderProducts: Record<string, { id: string; name: string }[]> = {}
    for (const item of (orderItemsRes.data || []) as any[]) {
      const orderId = (item.orders as any)?.id || item.order_id
      if (!orderId) continue
      if (!orderProducts[orderId]) orderProducts[orderId] = []
      const variantKey = `${item.product_id || item.product_name}|${item.variant_label || ''}`
      const displayName = item.variant_label
        ? `${item.product_name} (${item.variant_label})`
        : item.product_name
      orderProducts[orderId].push({ id: variantKey, name: displayName })
    }
    const pairCount: Record<string, { a: string; b: string; count: number }> = {}
    for (const prods of Object.values(orderProducts)) {
      const unique = Array.from(new Map(prods.map(p => [p.id, p])).values())
      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          const [pa, pb] = unique[i].name <= unique[j].name ? [unique[i], unique[j]] : [unique[j], unique[i]]
          const key = `${pa.id}||${pb.id}`
          if (!pairCount[key]) pairCount[key] = { a: pa.name, b: pb.name, count: 0 }
          pairCount[key].count++
        }
      }
    }
    const topPairs = Object.values(pairCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
    setPairs(topPairs)

    // ── 13: Unspent credit ────────────────────────────────────────────────────

    const { data: bochurimData } = await supabase
      .from('bochurim_with_id')
      .select('id, name, bochur_number, balance')
      .eq('archived', false)
      .gt('balance', 0)
      .order('balance', { ascending: false })
      .limit(20)

    const { data: recentBochurOrders } = await supabase
      .from('orders')
      .select('bochur_id, created_at')
      .eq('status', 'completed')
      .not('bochur_id', 'is', null)
      .order('created_at', { ascending: false })

    const lastOrderByBochur: Record<string, string> = {}
    for (const o of (recentBochurOrders || []) as any[]) {
      if (!lastOrderByBochur[o.bochur_id]) {
        lastOrderByBochur[o.bochur_id] = o.created_at
      }
    }

    const bochurimSeenInRange = new Set(
      (allOrdersForCustomers.data || [])
        .filter((o: any) => o.created_at >= fromISO && o.created_at < toISO)
        .map((o: any) => o.bochur_id)
    )

    const creditList: BochurCredit[] = (bochurimData || []).map((b: any) => ({
      id: b.id,
      name: b.name,
      bochur_number: b.bochur_number,
      balance: Number(b.balance),
      lastOrderDate: lastOrderByBochur[b.id] || null,
      seenRecently: bochurimSeenInRange.has(b.id),
    }))
    setCredits(creditList)

    // ── 14: Average order value by day ────────────────────────────────────────

    const dailyMap: Record<string, { total: number; count: number }> = {}
    for (const order of completedOrders) {
      const date = order.created_at.split('T')[0]
      if (!dailyMap[date]) dailyMap[date] = { total: 0, count: 0 }
      dailyMap[date].total += Number(order.total)
      dailyMap[date].count += 1
    }
    const dailyAvgData: DailyAvgOrder[] = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => {
        const dt = new Date(date + 'T00:00:00Z')
        return {
          date: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          avg: d.count > 0 ? Math.round((d.total / d.count) * 100) / 100 : 0,
          count: d.count,
        }
      })
    setDailyAvgOrder(dailyAvgData)

    // ── 15: Revenue by account type ───────────────────────────────────────────

    const atMap: Record<string, number> = {}
    for (const order of (accountTypeOrdersRes.data || []) as any[]) {
      const atName = order.bochurim?.account_types?.name || (order.bochur_id ? 'No Account Type' : 'Walk-in')
      atMap[atName] = (atMap[atName] || 0) + Number(order.total)
    }
    const atData: AccountTypeRevData[] = Object.entries(atMap)
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
    setAccountTypeRevenue(atData)

    // ── 16: Student visit frequency ───────────────────────────────────────────

    const bochurOrderCount: Record<string, number> = {}
    for (const o of allBochurOrders as any[]) {
      if (o.created_at >= fromISO && o.created_at < toISO) {
        bochurOrderCount[o.bochur_id] = (bochurOrderCount[o.bochur_id] || 0) + 1
      }
    }
    let freq1 = 0, freq2to5 = 0, freq6plus = 0
    for (const count of Object.values(bochurOrderCount)) {
      if (count === 1) freq1++
      else if (count <= 5) freq2to5++
      else freq6plus++
    }
    setVisitFrequency([
      { bucket: '1 visit', count: freq1 },
      { bucket: '2–5 visits', count: freq2to5 },
      { bucket: '6+ visits', count: freq6plus },
    ])

    // ── 17: Daily revenue over range ──────────────────────────────────────────

    const dailyRevMap: Record<string, number> = {}
    for (const order of completedOrders) {
      const dateKey = order.created_at.split('T')[0]
      dailyRevMap[dateKey] = (dailyRevMap[dateKey] || 0) + Number(order.total)
    }
    // Fill every calendar day in the range (missing days get 0)
    const rangeFrom = new Date(fromISO)
    const rangeTo = new Date(toISO)
    const dailyRevData: { date: string; revenue: number }[] = []
    const cur = new Date(rangeFrom)
    while (cur < rangeTo) {
      const dateKey = cur.toISOString().split('T')[0]
      const label = new Date(dateKey + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      dailyRevData.push({ date: label, revenue: dailyRevMap[dateKey] || 0 })
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
    setDailyRevenue(dailyRevData)

    // ── 18: Day-of-week revenue ────────────────────────────────────────────────

    const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const dowMap: Record<number, { revenue: number; count: number }> = {}
    for (let i = 0; i < 7; i++) dowMap[i] = { revenue: 0, count: 0 }
    for (const order of completedOrders) {
      const dow = new Date(order.created_at).getUTCDay()
      dowMap[dow].revenue += Number(order.total)
      dowMap[dow].count += 1
    }
    // Order Mon→Sun
    const dowData = [1, 2, 3, 4, 5, 6, 0].map(i => ({
      day: DOW_LABELS[i],
      revenue: dowMap[i].revenue,
      count: dowMap[i].count,
      avg: dowMap[i].count > 0 ? dowMap[i].revenue / dowMap[i].count : 0,
    }))
    setDayOfWeekRevenue(dowData)

    // ── 19: Category revenue detail table ────────────────────────────────────

    const catDetailMap: Record<string, { revenue: number; quantity: number }> = {}
    for (const item of (orderItemsRes.data || []) as any[]) {
      const catName =
        (item.products as any)?.product_categories?.[0]?.categories?.name ||
        'Uncategorised'
      if (!catDetailMap[catName]) catDetailMap[catName] = { revenue: 0, quantity: 0 }
      catDetailMap[catName].revenue += Number(item.total)
      catDetailMap[catName].quantity += Number(item.quantity)
    }
    const catDetailData = Object.entries(catDetailMap)
      .map(([name, d]) => ({ name, revenue: d.revenue, quantity: d.quantity }))
      .sort((a, b) => b.revenue - a.revenue)
    setCategoriesDetail(catDetailData)

    // ── 20: Top 10 student spenders ───────────────────────────────────────────

    const spenderMap: Record<string, { name: string; total: number }> = {}
    for (const order of (ordersRes.data || []) as any[]) {
      if (!order.bochur_id || order.status !== 'completed') continue
      const name = (order.bochurim as any)?.name || 'Unknown'
      if (!spenderMap[order.bochur_id]) spenderMap[order.bochur_id] = { name, total: 0 }
      spenderMap[order.bochur_id].total += Number(order.total)
    }
    const topSpendersData = Object.values(spenderMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
    setTopSpenders(topSpendersData)

    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, customFrom, customTo])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Preset button handler ─────────────────────────────────────────────────

  function applyPreset(preset: Exclude<DateRange, 'custom'>) {
    setRange(preset)
    const { from, to } = getDateRangeForPreset(preset)
    const fmtDate = (d: Date) => {
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth() + 1).padStart(2, '0')
      const day = String(d.getUTCDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    setCustomFrom(fmtDate(from))
    // to is exclusive (next day), so subtract a day for display
    const toDisplay = new Date(to)
    toDisplay.setUTCDate(toDisplay.getUTCDate() - 1)
    setCustomTo(fmtDate(toDisplay))
  }

  // ── Export CSV ────────────────────────────────────────────────────────────

  async function exportCSV() {
    setExporting(true)
    try {
      const { fromISO, toISO } = resolveRange()
      const { data } = await supabase
        .from('orders')
        .select('id, created_at, total, bochurim!bochur_id(name), cashier_profiles!cashier_id(name), payments(method, amount)')
        .eq('status', 'completed')
        .gte('created_at', fromISO)
        .lt('created_at', toISO)
        .order('created_at', { ascending: true })

      if (!data || data.length === 0) {
        alert('No orders found in this date range.')
        return
      }

      const headers = ['Date', 'Time', 'Order ID', 'Student', 'Cashier', 'Payment Method', 'Total']
      const rows = (data as any[]).map(o => {
        const d = new Date(o.created_at)
        const methods = Array.isArray(o.payments) ? o.payments.map((p: any) => p.method).join('/') : ''
        return [
          d.toLocaleDateString('en-US'),
          d.toLocaleTimeString('en-US'),
          o.id,
          `"${(o.bochurim as any)?.name || 'Walk-in'}"`,
          `"${(o.cashier_profiles as any)?.name || ''}"`,
          `"${methods}"`,
          Number(o.total).toFixed(2),
        ].join(',')
      })

      const csv = [headers.join(','), ...rows].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `canteen-${customFrom}-to-${customTo}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const RANGE_OPTIONS: { value: Exclude<DateRange, 'custom'>; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'this_week', label: 'This Week' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_30', label: 'Last 30 Days' },
  ]

  const stockColors = ['#10b981', '#f59e0b', '#ef4444']
  const customerPieData = customers
    ? [
        { name: 'New', value: customers.newCustomers },
        { name: 'Returning', value: customers.returning },
      ]
    : []

  const visitTotal = visitFrequency.reduce((s, f) => s + f.count, 0)

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Reports</h1>
            <p className="text-slate-500 text-sm mt-1">Analytics and sales insights</p>
          </div>

          {/* Export button */}
          <button
            onClick={exportCSV}
            disabled={exporting || loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all shadow-sm"
          >
            {exporting ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            Export CSV
          </button>
        </div>

        {/* Date range controls */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          {/* Preset buttons */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 shrink-0">
            {RANGE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => applyPreset(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  range === opt.value
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Custom date inputs */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium shrink-0">From</span>
            <input
              type="date"
              value={customFrom}
              onChange={e => { setCustomFrom(e.target.value); setRange('custom') }}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 ${
                range === 'custom' ? 'border-indigo-300 bg-white text-slate-900' : 'border-slate-200 bg-white text-slate-600'
              }`}
            />
            <span className="text-xs text-slate-400 font-medium shrink-0">To</span>
            <input
              type="date"
              value={customTo}
              onChange={e => { setCustomTo(e.target.value); setRange('custom') }}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 ${
                range === 'custom' ? 'border-indigo-300 bg-white text-slate-900' : 'border-slate-200 bg-white text-slate-600'
              }`}
            />
            {range === 'custom' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 shrink-0">
                Custom
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 7: Gross vs Net (summary strip) ────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <StatSkeleton />
            </div>
          ))
        ) : financial ? (
          <>
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Gross Sales</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(financial.gross)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Product COGS</p>
              <p className="text-2xl font-bold text-orange-500 mt-1">{formatCurrency(financial.cogs)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Expenses</p>
              <p className="text-2xl font-bold text-red-500 mt-1">{formatCurrency(financial.expenses)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Wastage</p>
              <p className="text-2xl font-bold text-red-400 mt-1">{formatCurrency(financial.wastage)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 sm:col-span-3 lg:col-span-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Net Profit</p>
              <p className={`text-2xl font-bold mt-1 ${financial.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(financial.net)}</p>
              <p className="text-xs text-slate-400 mt-1">{financial.margin.toFixed(1)}% margin</p>
            </div>
          </>
        ) : null}
      </div>

      {/* ── COGS Breakdown Table ──────────────────────────────────────────────── */}
      {!loading && cogsBreakdown.length > 0 && (
        <SectionCard title="Product COGS Breakdown" subtitle="Cost per unit × units sold for products with cost prices set">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px] text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide pb-2">Product</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide pb-2">Units Sold</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide pb-2">Cost / Unit</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide pb-2">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {cogsBreakdown.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? '' : 'bg-slate-50/50'}>
                    <td className="py-2.5 pr-4 text-slate-700 font-medium">{row.name}</td>
                    <td className="py-2.5 text-right text-slate-600">{row.units}</td>
                    <td className="py-2.5 text-right text-slate-600">{formatCurrency(row.costPerUnit)}</td>
                    <td className="py-2.5 text-right font-semibold text-orange-600">{formatCurrency(row.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200">
                  <td colSpan={3} className="pt-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Product COGS</td>
                  <td className="pt-3 text-right font-bold text-orange-600">
                    {formatCurrency(cogsBreakdown.reduce((s, r) => s + r.total, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </SectionCard>
      )}

      {/* ── NEW: Average Order Value Trend ───────────────────────────────────── */}
      <SectionCard title="Average Order Value Trend" subtitle="Daily avg order value over the selected range">
        {loading ? (
          <ChartSkeleton />
        ) : dailyAvgOrder.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No orders in this period</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyAvgOrder} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                interval={Math.max(0, Math.floor(dailyAvgOrder.length / 8) - 1)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip content={<CurrencyTooltip />} />
              <Line
                type="monotone"
                dataKey="avg"
                name="Avg Order"
                stroke="#6366f1"
                strokeWidth={2}
                dot={dailyAvgOrder.length <= 31}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* ── Sections 1 & 2: Hourly charts ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1: Hourly revenue heatmap */}
        <SectionCard title="Hourly Sales Heatmap" subtitle="Revenue by hour of day">
          {loading ? (
            <ChartSkeleton />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hourly} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  interval={2}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip content={<CurrencyTooltip />} />
                <Bar dataKey="revenue" name="Revenue" fill="#6366f1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        {/* 2: Transactions per hour */}
        <SectionCard title="Transactions Per Hour" subtitle="Order count by hour of day">
          {loading ? (
            <ChartSkeleton />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={hourly} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  interval={2}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CurrencyTooltip />} />
                <Line
                  type="monotone"
                  dataKey="transactions"
                  name="Transactions"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      {/* ── Section 3: Top 10 Products ────────────────────────────────────────── */}
      <SectionCard title="Top 10 Products" subtitle="By units sold">
        {loading ? (
          <ChartSkeleton height={280} />
        ) : topProducts.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No sales data for this period</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, topProducts.length * 36)}>
            <BarChart
              data={topProducts}
              layout="vertical"
              margin={{ top: 4, right: 60, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fontSize: 11, fill: '#475569' }}
                tickLine={false}
                axisLine={false}
                width={120}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]?.payload as TopProduct
                  return (
                    <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-xs">
                      <p className="font-semibold text-slate-700 mb-1">{label}</p>
                      <p className="text-emerald-600">{d.units} units sold</p>
                      <p className="text-slate-500">{formatCurrency(d.revenue)} revenue</p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="units" name="Units Sold" fill="#10b981" radius={[0, 3, 3, 0]} label={{ position: 'right', fontSize: 10, fill: '#94a3b8' }} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* ── Sections 4 & 5: Category + Payment ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 4: Sales by category */}
        <SectionCard title="Sales by Category" subtitle="Revenue breakdown">
          {loading ? (
            <ChartSkeleton />
          ) : categories.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categories} margin={{ top: 4, right: 4, left: -10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#94a3b8', dy: 6 }}
                  tickLine={false}
                  axisLine={false}
                  angle={-30}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip content={<CurrencyTooltip />} />
                <Bar dataKey="revenue" name="Revenue" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        {/* 5: Payment method breakdown */}
        <SectionCard title="Payment Method Breakdown" subtitle="By revenue">
          {loading ? (
            <ChartSkeleton />
          ) : payments.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No payment data</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="60%" height={200}>
                <PieChart>
                  <Pie
                    data={payments}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    paddingAngle={3}
                  >
                    {payments.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {payments.map((p, idx) => {
                  const total = payments.reduce((s, x) => s + x.value, 0)
                  const pct = total > 0 ? (p.value / total) * 100 : 0
                  return (
                    <div key={p.name} className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">{p.name}</p>
                        <p className="text-xs text-slate-400">{pct.toFixed(1)}% · {formatCurrency(p.value)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── NEW: Revenue by Account Type + Student Visit Frequency ───────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by account type */}
        <SectionCard title="Revenue by Account Type" subtitle="Total spend per account type">
          {loading ? (
            <ChartSkeleton />
          ) : accountTypeRevenue.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No account type data</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, accountTypeRevenue.length * 48)}>
              <BarChart
                data={accountTypeRevenue}
                layout="vertical"
                margin={{ top: 4, right: 80, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v}`}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 11, fill: '#475569' }}
                  tickLine={false}
                  axisLine={false}
                  width={110}
                />
                <Tooltip content={<CurrencyTooltip />} />
                <Bar
                  dataKey="revenue"
                  name="Revenue"
                  fill="#8b5cf6"
                  radius={[0, 3, 3, 0]}
                  label={{
                    position: 'right',
                    fontSize: 10,
                    fill: '#94a3b8',
                    formatter: (v: any) => formatCurrency(Number(v)),
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        {/* Student visit frequency */}
        <SectionCard title="Student Visit Frequency" subtitle="How often students purchased in this period">
          {loading ? (
            <ChartSkeleton />
          ) : visitTotal === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No student orders in this period</p>
          ) : (
            <div className="space-y-5 py-2">
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{visitTotal}</span> students made at least one purchase
              </p>
              {visitFrequency.map((f) => {
                const pct = visitTotal > 0 ? (f.count / visitTotal) * 100 : 0
                return (
                  <div key={f.bucket} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">{f.bucket}</span>
                      <span className="text-slate-500">
                        <span className="font-semibold text-slate-800">{f.count}</span> students ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-400 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Section 6: Sales by Cashier ───────────────────────────────────────── */}
      <SectionCard title="Sales by Cashier" subtitle="Orders, revenue and average ticket">
        {loading ? (
          <ChartSkeleton height={180} />
        ) : cashiers.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No cashier data</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-2 pr-4">Cashier</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide py-2 pr-4">Orders</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide py-2 pr-4">Revenue</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide py-2">Avg Ticket</th>
                </tr>
              </thead>
              <tbody>
                {cashiers.map((c) => (
                  <tr key={c.name} className="border-b border-slate-50 last:border-0">
                    <td className="py-3 pr-4 text-sm font-medium text-slate-800">{c.name}</td>
                    <td className="py-3 pr-4 text-sm text-slate-600 text-right">{c.orders}</td>
                    <td className="py-3 pr-4 text-sm font-semibold text-slate-800 text-right">{formatCurrency(c.revenue)}</td>
                    <td className="py-3 text-sm text-slate-500 text-right">{formatCurrency(c.avg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Sections 8, 9, 10 ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 8: Void & refund rate */}
        <SectionCard title="Refund and Void Rate">
          {loading ? (
            <ChartSkeleton height={160} />
          ) : voids ? (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-4xl font-bold text-slate-900">{voids.rate.toFixed(1)}%</p>
                <p className="text-xs text-slate-400 mt-1">void + refund rate</p>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Completed', value: voids.completed, color: 'bg-emerald-400' },
                  { label: 'Voided', value: voids.voided, color: 'bg-amber-400' },
                  { label: 'Refunded', value: voids.refunded, color: 'bg-red-400' },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${row.color}`} />
                      <span className="text-slate-600 font-medium">{row.label}</span>
                    </div>
                    <span className="font-semibold text-slate-800">{row.value}</span>
                  </div>
                ))}
                <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">Total orders</span>
                  <span className="font-semibold text-slate-800">{voids.total}</span>
                </div>
              </div>
            </div>
          ) : null}
        </SectionCard>

        {/* 9: Stock donut */}
        <SectionCard title="Inventory Status">
          {loading ? (
            <ChartSkeleton height={200} />
          ) : (
            <div className="flex flex-col items-center gap-3">
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={stock}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    dataKey="value"
                    paddingAngle={3}
                  >
                    {stock.map((_, idx) => (
                      <Cell key={idx} fill={stockColors[idx]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 text-xs">
                {stock.map((s, idx) => (
                  <div key={s.name} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: stockColors[idx] }} />
                    <span className="text-slate-600">{s.name}</span>
                    <span className="font-semibold text-slate-800">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        {/* 10: New vs returning */}
        <SectionCard title="New vs Returning Customers">
          {loading ? (
            <ChartSkeleton height={200} />
          ) : customers ? (
            <div className="flex flex-col items-center gap-3">
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={customerPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    dataKey="value"
                    paddingAngle={3}
                  >
                    <Cell fill="#6366f1" />
                    <Cell fill="#10b981" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-6 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span className="text-slate-600">New</span>
                  <span className="font-semibold text-slate-800">{customers.newCustomers}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-slate-600">Returning</span>
                  <span className="font-semibold text-slate-800">{customers.returning}</span>
                </div>
              </div>
              {customers.newCustomers + customers.returning > 0 && (
                <p className="text-xs text-slate-400 text-center">
                  {(
                    (customers.newCustomers / (customers.newCustomers + customers.returning)) *
                    100
                  ).toFixed(0)}% new customers this period
                </p>
              )}
            </div>
          ) : null}
        </SectionCard>
      </div>

      {/* ── Section 11: Dead Stock / Bottom Sellers ───────────────────────────── */}
      <SectionCard title="Dead Stock / Bottom Sellers" subtitle="10 worst performers by units sold">
        {loading ? (
          <ChartSkeleton height={240} />
        ) : bottomSellers.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No sales data for this period</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, bottomSellers.length * 36)}>
            <BarChart
              data={bottomSellers}
              layout="vertical"
              margin={{ top: 4, right: 60, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fontSize: 11, fill: '#475569' }}
                tickLine={false}
                axisLine={false}
                width={120}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]?.payload as TopProduct
                  return (
                    <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-xs">
                      <p className="font-semibold text-slate-700 mb-1">{label}</p>
                      <p className="text-amber-600">{d.units} units sold</p>
                      <p className="text-slate-500">{formatCurrency(d.revenue)} revenue</p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="units" name="Units Sold" fill="#f59e0b" radius={[0, 3, 3, 0]} label={{ position: 'right', fontSize: 10, fill: '#94a3b8' }} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* ── Section 12: Frequently Bought Together ────────────────────────────── */}
      <SectionCard title="Frequently Bought Together" subtitle="Top product pairs co-occurring in the same order">
        {loading ? (
          <ChartSkeleton height={200} />
        ) : pairs.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">Not enough multi-item orders in this period</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-2 pr-4">#</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-2 pr-4">Product A</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-2 pr-4">Product B</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide py-2">Orders Together</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((pair, i) => (
                  <tr key={`${pair.a}||${pair.b}`} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 pr-4 text-xs text-slate-400 font-medium">#{i + 1}</td>
                    <td className="py-2.5 pr-4 text-sm font-medium text-slate-800">{pair.a}</td>
                    <td className="py-2.5 pr-4 text-sm font-medium text-slate-800">{pair.b}</td>
                    <td className="py-2.5 text-sm font-bold text-indigo-600 text-right">{pair.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Section A: Daily Revenue Line Chart ──────────────────────────────── */}
      <SectionCard title="Daily Revenue" subtitle="Total revenue by day over selected range">
        {loading ? (
          <ChartSkeleton />
        ) : dailyRevenue.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No orders in this period</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={dailyRevenue} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                interval={Math.max(0, Math.floor(dailyRevenue.length / 8) - 1)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: any) => `$${v}`}
              />
              <Tooltip
                formatter={(value: any) => [formatCurrency(Number(value)), 'Revenue']}
                labelStyle={{ color: '#475569', fontWeight: 600 }}
                contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke="#10b981"
                strokeWidth={2}
                dot={dailyRevenue.length <= 31}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* ── Section B: Day-of-Week Revenue Bar Chart ─────────────────────────── */}
      <SectionCard title="Revenue by Day of Week" subtitle="Average daily revenue Mon–Sun over selected range">
        {loading ? (
          <ChartSkeleton />
        ) : dayOfWeekRevenue.every(d => d.revenue === 0) ? (
          <p className="text-sm text-slate-400 text-center py-10">No orders in this period</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dayOfWeekRevenue} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: any) => `$${v}`}
              />
              <Tooltip
                formatter={(value: any, name: any) => [
                  name === 'avg' ? formatCurrency(Number(value)) : Number(value),
                  name === 'avg' ? 'Avg Revenue' : name === 'revenue' ? 'Total Revenue' : 'Orders',
                ]}
                labelStyle={{ color: '#475569', fontWeight: 600 }}
                contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
              />
              <Legend formatter={(v: any) => v === 'revenue' ? 'Total Revenue' : v === 'avg' ? 'Avg Revenue/Day' : v} />
              <Bar dataKey="revenue" name="revenue" fill="#6366f1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="avg" name="avg" fill="#a5b4fc" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* ── Section C: Category Revenue Table ────────────────────────────────── */}
      <SectionCard title="Revenue by Category" subtitle="Total revenue and units sold per category — sorted by revenue">
        {loading ? (
          <ChartSkeleton height={180} />
        ) : categoriesDetail.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No category data in this period</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-2 pr-4">#</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-2 pr-4">Category</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide py-2 pr-4">Units Sold</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide py-2">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {categoriesDetail.map((cat, i) => (
                  <tr
                    key={cat.name}
                    className={`border-b border-slate-50 last:border-0 ${i % 2 === 1 ? 'bg-slate-50/50' : ''}`}
                  >
                    <td className="py-2.5 pr-4 text-xs text-slate-400 font-medium">#{i + 1}</td>
                    <td className="py-2.5 pr-4 text-sm font-medium text-slate-800">{cat.name}</td>
                    <td className="py-2.5 pr-4 text-sm text-slate-600 text-right">{cat.quantity}</td>
                    <td className="py-2.5 text-sm font-semibold text-slate-800 text-right">{formatCurrency(cat.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Section D: Top 10 Student Spenders ───────────────────────────────── */}
      <SectionCard title="Top 10 Student Spenders" subtitle="Highest-spending bochurim in selected period">
        {loading ? (
          <ChartSkeleton height={220} />
        ) : topSpenders.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No student orders in this period</p>
        ) : (
          <div className="space-y-2">
            {topSpenders.map((s, i) => {
              const maxTotal = topSpenders[0]?.total || 1
              const pct = (s.total / maxTotal) * 100
              return (
                <div key={`${s.name}-${i}`} className="flex items-center gap-3">
                  <span className="w-6 text-xs font-bold text-slate-400 text-right shrink-0">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-800 truncate">{s.name}</span>
                      <span className="text-sm font-bold text-slate-900 ml-2 shrink-0">{formatCurrency(s.total)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-400 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      {/* ── Section 13: Unspent Credit ────────────────────────────────────────── */}
      <SectionCard title="Unspent Credit (Top Balances)" subtitle="Bochurim with credit who may need reminding">
        {loading ? (
          <ChartSkeleton height={240} />
        ) : credits.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No bochurim with positive balances</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-2 pr-4">Name</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-2 pr-4">Number</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide py-2 pr-4">Balance</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-2 pr-4">Last Order</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {credits.map((b) => (
                  <tr key={b.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 pr-4 text-sm font-medium text-slate-800">{b.name}</td>
                    <td className="py-2.5 pr-4 text-sm text-slate-500">{b.bochur_number || '—'}</td>
                    <td className="py-2.5 pr-4 text-sm font-bold text-emerald-600 text-right">{formatCurrency(b.balance)}</td>
                    <td className="py-2.5 pr-4 text-sm text-slate-400">
                      {b.lastOrderDate
                        ? new Date(b.lastOrderDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'No orders'}
                    </td>
                    <td className="py-2.5">
                      {b.seenRecently ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
                          Not seen recently
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
