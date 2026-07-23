import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import { TrendingUp, Users, ShoppingCart, AlertTriangle, Package, CreditCard, ArrowUpRight, ArrowDownRight, BarChart2 } from 'lucide-react'
import { format } from 'date-fns'
import TopProductsTable from '@/components/admin/TopProductsTable'
import LowStockList from '@/components/admin/LowStockList'

export const revalidate = 60

// The canteen operates in America/New_York. This is a Server Component (no
// browser local time available), and Vercel's Node runtime defaults to UTC —
// so building "today" from `now.getUTCDate()` etc. computed the wrong calendar
// day for most of the actual business day (same bug class as the Reports/
// Accounts UTC-vs-local fix, but those are client components that could just
// read the browser's local time; this one has to hardcode the zone instead).
const CANTEEN_TZ = 'America/New_York'

function getZonedTodayBounds(timeZone: string, now: Date) {
  const zonedNow = new Date(now.toLocaleString('en-US', { timeZone }))
  const utcNow = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }))
  const offsetMs = zonedNow.getTime() - utcNow.getTime()
  const y = zonedNow.getFullYear(), m = zonedNow.getMonth(), d = zonedNow.getDate()
  const todayStart = new Date(Date.UTC(y, m, d) - offsetMs)
  const pad = (n: number) => String(n).padStart(2, '0')
  const todayDateStr = `${y}-${pad(m + 1)}-${pad(d)}`
  return { todayStart, todayDateStr }
}

async function getStats(supabase: any) {
  const now = new Date()
  const { todayStart: today, todayDateStr } = getZonedTodayBounds(CANTEEN_TZ, now)
  const weekAgo = new Date(today); weekAgo.setUTCDate(weekAgo.getUTCDate() - 7)
  const twoWeeksAgo = new Date(today); twoWeeksAgo.setUTCDate(twoWeeksAgo.getUTCDate() - 14)
  const monthAgo = new Date(today); monthAgo.setUTCMonth(monthAgo.getUTCMonth() - 1)
  const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30)

  const [
    todayOrders,
    weekOrders,
    lastWeekOrders,
    monthOrders,
    bochurim,
    recentOrders,
    topProducts,
    paymentBreakdown,
    settingsRows,
    todayExpensesRes,
    todayWastageRes,
    todayCOGSRes,
  ] = await Promise.all([
    supabase.from('orders').select('total').eq('status', 'completed').gte('created_at', today.toISOString()),
    supabase.from('orders').select('total').eq('status', 'completed').gte('created_at', weekAgo.toISOString()),
    supabase.from('orders').select('total').eq('status', 'completed')
      .gte('created_at', twoWeeksAgo.toISOString())
      .lt('created_at', weekAgo.toISOString()),
    supabase.from('orders').select('total').eq('status', 'completed').gte('created_at', monthAgo.toISOString()),
    supabase.from('bochurim_with_id').select('balance').eq('archived', false),
    supabase
      .from('orders')
      .select('id, order_number, bochur_id, total, created_at, cashier_profiles(name)')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(10),
    // Top products by quantity sold in last 30 days — join via orders
    supabase
      .from('order_items')
      .select('product_id, product_name, quantity, total, orders!inner(created_at, status)')
      .eq('orders.status', 'completed')
      .gte('orders.created_at', thirtyDaysAgo.toISOString()),
    // Payment method breakdown — last 30 days
    supabase
      .from('payments')
      .select('method, amount')
      .gte('created_at', thirtyDaysAgo.toISOString()),
    // App settings for daily revenue target
    supabase.from('app_settings').select('key,value'),
    // Today's expenses
    supabase.from('expense_entries').select('amount').gte('date', todayDateStr).lte('date', todayDateStr),
    // Today's wastage
    supabase.from('wastage_log').select('unit_cost, quantity').gte('created_at', today.toISOString()),
    // Today's COGS from completed order items — live join to products.cost_price
    // (matches how Reports computes COGS) rather than order_items.cost_price,
    // which the checkout route never populated, so this always summed to $0.
    supabase
      .from('order_items')
      .select('quantity, products(cost_price), orders!inner(created_at, status)')
      .eq('orders.status', 'completed')
      .gte('orders.created_at', today.toISOString()),
  ])

  // Aggregate top products
  const productMap: Record<string, { id: string | null; name: string; qty: number; revenue: number }> = {}
  for (const item of (topProducts.data || []) as any[]) {
    const key = item.product_id || item.product_name
    if (!productMap[key]) {
      productMap[key] = { id: item.product_id ?? null, name: item.product_name, qty: 0, revenue: 0 }
    }
    productMap[key].qty += item.quantity
    productMap[key].revenue += Number(item.total)
  }
  const topProductsList = Object.values(productMap)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 8)

  // Aggregate payment methods
  const paymentMap: Record<string, number> = {}
  for (const p of (paymentBreakdown.data || []) as any[]) {
    paymentMap[p.method] = (paymentMap[p.method] || 0) + Number(p.amount)
  }
  const paymentTotal = Object.values(paymentMap).reduce((s, v) => s + v, 0)

  const thisWeekRevenue = (weekOrders.data || []).reduce((s: number, o: any) => s + Number(o.total), 0)
  const lastWeekRevenue = (lastWeekOrders.data || []).reduce((s: number, o: any) => s + Number(o.total), 0)

  const settingsMap: Record<string, string> = {}
  for (const s of (settingsRows.data || [])) settingsMap[s.key] = s.value
  const dailyTarget = parseFloat(settingsMap['daily_revenue_target'] || '0') || 0

  const todayExpenses = (todayExpensesRes.data || []).reduce((s: number, e: any) => s + Number(e.amount), 0)
  const todayWastage = (todayWastageRes.data || []).reduce((s: number, w: any) => s + Number(w.unit_cost || 0) * Number(w.quantity), 0)
  let todayCOGS = 0
  for (const item of (todayCOGSRes.data || []) as any[]) {
    todayCOGS += Number(item.products?.cost_price || 0) * Number(item.quantity)
  }

  return {
    todayRevenue: (todayOrders.data || []).reduce((s: number, o: any) => s + Number(o.total), 0),
    todayCount: todayOrders.data?.length || 0,
    weekRevenue: thisWeekRevenue,
    weekCount: weekOrders.data?.length || 0,
    lastWeekRevenue,
    lastWeekCount: lastWeekOrders.data?.length || 0,
    monthRevenue: (monthOrders.data || []).reduce((s: number, o: any) => s + Number(o.total), 0),
    monthCount: monthOrders.data?.length || 0,
    bochurimCount: bochurim.data?.length || 0,
    avgBalance: bochurim.data?.length
      ? (bochurim.data as any[]).reduce((s: number, b: any) => s + b.balance, 0) / bochurim.data.length
      : 0,
    recentOrders: recentOrders.data || [],
    topProducts: topProductsList,
    paymentMap,
    paymentTotal,
    dailyTarget,
    todayCOGS,
    todayExpenses,
    todayWastage,
  }
}

function WeekComparison({ thisWeek, lastWeek }: { thisWeek: number; lastWeek: number }) {
  const diff = lastWeek === 0 ? null : ((thisWeek - lastWeek) / lastWeek) * 100
  if (diff === null) return null
  const up = diff >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
      {Math.abs(diff).toFixed(1)}% vs last week
    </span>
  )
}

const METHOD_LABELS: Record<string, string> = {
  balance: 'Balance',
  cash: 'Cash',
  credit_card: 'Credit Card',
  card: 'Credit Card',
}

const METHOD_COLORS: Record<string, string> = {
  balance: 'bg-blue-500',
  cash: 'bg-emerald-500',
  credit_card: 'bg-violet-500',
  card: 'bg-violet-500',
}

export default async function DashboardPage() {
  const supabase = createClient()
  const now = new Date()
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()

  const [stats, lowStockRes, failedRes] = await Promise.all([
    getStats(supabase),
    supabase
      .from('products')
      .select('id,name,stock_quantity,low_stock_threshold,icon')
      .eq('is_active', true)
      .order('stock_quantity')
      .limit(20),
    supabase
      .from('failed_checkout_log')
      .select('id,bochur_name,attempted_amount,balance_at_time,shortfall,created_at')
      .gte('created_at', todayStart)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const lowStockProducts = lowStockRes.data
  const failedCheckouts = failedRes.data || []

  const actualLowStock = (lowStockProducts || []).filter(
    (p: any) => p.stock_quantity !== null && p.stock_quantity <= p.low_stock_threshold
  )

  const avgOrderValue = stats.todayCount > 0 ? stats.todayRevenue / stats.todayCount : 0
  const todayNetProfit = stats.todayRevenue - stats.todayCOGS - stats.todayExpenses - stats.todayWastage

  const statCards = [
    {
      label: "Today's Revenue",
      value: formatCurrency(stats.todayRevenue),
      sub: `${stats.todayCount} orders · avg ${formatCurrency(avgOrderValue)}`,
      icon: TrendingUp,
      iconColor: 'text-emerald-600',
      iconBg: 'bg-emerald-100',
    },
    {
      label: 'This Week',
      value: formatCurrency(stats.weekRevenue),
      sub: `${stats.weekCount} orders`,
      icon: ShoppingCart,
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-100',
      extra: <WeekComparison thisWeek={stats.weekRevenue} lastWeek={stats.lastWeekRevenue} />,
    },
    {
      label: 'This Month',
      value: formatCurrency(stats.monthRevenue),
      sub: `${stats.monthCount} orders`,
      icon: TrendingUp,
      iconColor: 'text-violet-600',
      iconBg: 'bg-violet-100',
    },
    {
      label: 'Bochurim',
      value: String(stats.bochurimCount),
      sub: `Avg balance ${formatCurrency(stats.avgBalance)}`,
      icon: Users,
      iconColor: 'text-amber-600',
      iconBg: 'bg-amber-100',
    },
  ]

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(card => (
          <div key={card.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 ${card.iconBg} rounded-xl flex items-center justify-center`}>
                <card.icon className={`w-5 h-5 ${card.iconColor}`} />
              </div>
            </div>
            <p className="text-3xl font-bold text-slate-900 tracking-tight">{card.value}</p>
            <p className="text-sm text-slate-500 font-medium mt-1">{card.label}</p>
            <p className="text-xs text-slate-400 mt-0.5">{card.sub}</p>
            {card.extra && <div className="mt-2">{card.extra}</div>}
          </div>
        ))}
      </div>

      {/* Analytics link */}
      <a
        href="/reports/overview"
        className="flex items-center justify-between gap-3 px-5 py-3 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-amber-200 transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center group-hover:bg-amber-100 transition-colors">
            <BarChart2 className="w-4 h-4 text-amber-600" />
          </div>
          <span className="text-sm font-semibold text-slate-700 group-hover:text-amber-700 transition-colors">View Full Analytics</span>
        </div>
        <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-amber-500 transition-colors" />
      </a>

      {/* Today's Net Profit card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow duration-200">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${todayNetProfit >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
            <TrendingUp className={`w-5 h-5 ${todayNetProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`} />
          </div>
        </div>
        <p className={`text-3xl font-bold tracking-tight ${todayNetProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {formatCurrency(todayNetProfit)}
        </p>
        <p className="text-sm text-slate-500 font-medium mt-1">{"Today's Net Profit"}</p>
        <div className="text-xs text-slate-400 mt-1 space-y-0.5">
          <p>Revenue {formatCurrency(stats.todayRevenue)} · COGS −{formatCurrency(stats.todayCOGS)}</p>
          <p>Expenses −{formatCurrency(stats.todayExpenses)} · Wastage −{formatCurrency(stats.todayWastage)}</p>
        </div>
      </div>

      {/* Daily Revenue Goal */}
      {stats.dailyTarget > 0 && (() => {
        const pct = Math.min(100, (stats.todayRevenue / stats.dailyTarget) * 100)
        const reached = stats.todayRevenue >= stats.dailyTarget
        return (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-900">Daily Revenue Goal</h2>
              {reached ? (
                <span className="text-sm font-semibold text-emerald-600">Goal reached! 🎉</span>
              ) : (
                <span className="text-sm text-slate-400">{pct.toFixed(1)}%</span>
              )}
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all ${reached ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-slate-600 font-medium">Today: {formatCurrency(stats.todayRevenue)}</span>
              <span className="text-sm text-slate-400">Target: {formatCurrency(stats.dailyTarget)}</span>
            </div>
          </div>
        )
      })()}

      {/* Week comparison + Payment breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Week comparison detail */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">This Week vs Last Week</h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">This Week</p>
                <p className="text-2xl font-bold text-slate-900 mt-0.5">{formatCurrency(stats.weekRevenue)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{stats.weekCount} orders</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Last Week</p>
                <p className="text-2xl font-bold text-slate-400 mt-0.5">{formatCurrency(stats.lastWeekRevenue)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{stats.lastWeekCount} orders</p>
              </div>
            </div>
            {/* Visual bar comparison */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-20">This week</span>
                <div className="flex-1 bg-slate-100 rounded-full h-2.5">
                  <div
                    className="bg-blue-500 h-2.5 rounded-full transition-all"
                    style={{
                      width: `${stats.lastWeekRevenue === 0 && stats.weekRevenue === 0 ? 0 : stats.lastWeekRevenue === 0 ? 100 : Math.min(100, (stats.weekRevenue / Math.max(stats.weekRevenue, stats.lastWeekRevenue)) * 100)}%`
                    }}
                  />
                </div>
                <span className="text-xs font-semibold text-slate-700 w-16 text-right">{formatCurrency(stats.weekRevenue)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-20">Last week</span>
                <div className="flex-1 bg-slate-100 rounded-full h-2.5">
                  <div
                    className="bg-slate-300 h-2.5 rounded-full transition-all"
                    style={{
                      width: `${stats.lastWeekRevenue === 0 && stats.weekRevenue === 0 ? 0 : stats.weekRevenue === 0 ? 100 : Math.min(100, (stats.lastWeekRevenue / Math.max(stats.weekRevenue, stats.lastWeekRevenue)) * 100)}%`
                    }}
                  />
                </div>
                <span className="text-xs font-semibold text-slate-400 w-16 text-right">{formatCurrency(stats.lastWeekRevenue)}</span>
              </div>
            </div>
            <div className="pt-1">
              <WeekComparison thisWeek={stats.weekRevenue} lastWeek={stats.lastWeekRevenue} />
            </div>
          </div>
        </div>

        {/* Payment method breakdown */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <div className="w-6 h-6 bg-violet-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-3.5 h-3.5 text-violet-600" />
            </div>
            <h2 className="font-semibold text-slate-900">Revenue by Payment Method</h2>
            <span className="ml-auto text-xs text-slate-400">Last 30 days</span>
          </div>
          <div className="p-5 space-y-3">
            {stats.paymentTotal === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">No payment data</p>
            ) : (
              Object.entries(stats.paymentMap)
                .sort(([, a], [, b]) => b - a)
                .map(([method, amount]) => {
                  const pct = stats.paymentTotal > 0 ? (amount / stats.paymentTotal) * 100 : 0
                  const label = METHOD_LABELS[method] || method
                  const barColor = METHOD_COLORS[method] || 'bg-slate-400'
                  return (
                    <div key={method} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-700 font-medium">{label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">{pct.toFixed(1)}%</span>
                          <span className="text-sm font-semibold text-slate-900">{formatCurrency(amount)}</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2">
                        <div
                          className={`${barColor} h-2 rounded-full transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })
            )}
          </div>
        </div>
      </div>

      {/* Top products */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <div className="w-6 h-6 bg-emerald-100 rounded-lg flex items-center justify-center">
            <Package className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <h2 className="font-semibold text-slate-900">Top Selling Products</h2>
          <span className="ml-auto text-xs text-slate-400">Last 30 days · by quantity</span>
        </div>
        <TopProductsTable products={stats.topProducts} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent orders */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Recent Orders</h2>
            <span className="text-xs text-slate-400">{stats.recentOrders.length} shown</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr className="border-b border-slate-50 bg-slate-50/50">
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Order</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Customer</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Time</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders.map((order: any) => (
                  <tr key={order.id} className="table-row border-b border-slate-50 last:border-0">
                    <td className="px-5 py-3 text-sm font-semibold text-slate-900">#{order.order_number}</td>
                    <td className="px-5 py-3 text-sm text-slate-500">
                      {order.bochur_id ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                          Bochur
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block" />
                          Walk-in
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-400">{format(new Date(order.created_at), 'h:mm a')}</td>
                    <td className="px-5 py-3 text-sm font-bold text-slate-900 text-right">{formatCurrency(order.total)}</td>
                  </tr>
                ))}
                {stats.recentOrders.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-slate-400 text-sm">
                      No orders yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low stock */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <div className="w-6 h-6 bg-amber-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <h2 className="font-semibold text-slate-900">Low Stock</h2>
            {actualLowStock.length > 0 && (
              <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
                {actualLowStock.length}
              </span>
            )}
          </div>
          <LowStockList products={actualLowStock} />
        </div>
      </div>
      {/* Low balance alert log — bochur_name here is a denormalized string on failed_checkout_log
          with no bochur_id column, so it can't be made clickable into a student quick-view */}
      {failedCheckouts.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <div className="w-6 h-6 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            </div>
            <h2 className="font-semibold text-slate-900">Low Balance Alerts</h2>
            <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-600">
              {failedCheckouts.length} today
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr className="border-b border-slate-50 bg-slate-50/50">
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Student</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Tried to spend</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Balance</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Shortfall</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {failedCheckouts.map((f: any) => (
                  <tr key={f.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-3 text-sm font-medium text-slate-900">{f.bochur_name || 'Unknown'}</td>
                    <td className="px-5 py-3 text-sm text-right text-slate-700">{formatCurrency(f.attempted_amount)}</td>
                    <td className="px-5 py-3 text-sm text-right text-amber-600 font-medium">{formatCurrency(f.balance_at_time)}</td>
                    <td className="px-5 py-3 text-sm text-right text-red-600 font-semibold">{formatCurrency(f.shortfall)}</td>
                    <td className="px-5 py-3 text-sm text-right text-slate-400">{format(new Date(f.created_at), 'h:mm a')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
