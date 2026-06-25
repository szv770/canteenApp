import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import { TrendingUp, Users, ShoppingCart, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'

export const revalidate = 60

async function getStats(supabase: any) {
  // Use UTC midnight so date boundaries are consistent with stored timestamps
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const weekAgo = new Date(today); weekAgo.setUTCDate(weekAgo.getUTCDate() - 7)
  const monthAgo = new Date(today); monthAgo.setUTCMonth(monthAgo.getUTCMonth() - 1)

  const [todayOrders, weekOrders, monthOrders, bochurim, recentOrders] = await Promise.all([
    supabase.from('orders').select('total').eq('status', 'completed').gte('created_at', today.toISOString()),
    supabase.from('orders').select('total').eq('status', 'completed').gte('created_at', weekAgo.toISOString()),
    supabase.from('orders').select('total').eq('status', 'completed').gte('created_at', monthAgo.toISOString()),
    supabase.from('bochurim_with_id').select('balance').eq('archived', false),
    supabase.from('orders').select('*, cashier_profiles(name)').eq('status', 'completed').order('created_at', { ascending: false }).limit(10),
  ])

  return {
    todayRevenue: (todayOrders.data || []).reduce((s: number, o: any) => s + o.total, 0),
    todayCount: todayOrders.data?.length || 0,
    weekRevenue: (weekOrders.data || []).reduce((s: number, o: any) => s + o.total, 0),
    weekCount: weekOrders.data?.length || 0,
    monthRevenue: (monthOrders.data || []).reduce((s: number, o: any) => s + o.total, 0),
    monthCount: monthOrders.data?.length || 0,
    bochurimCount: bochurim.data?.length || 0,
    avgBalance: bochurim.data?.length
      ? (bochurim.data as any[]).reduce((s: number, b: any) => s + b.balance, 0) / bochurim.data.length
      : 0,
    recentOrders: recentOrders.data || [],
  }
}

export default async function DashboardPage() {
  const supabase = createClient()
  const stats = await getStats(supabase)
  const { data: lowStockProducts } = await supabase
    .from('products')
    .select('id,name,stock_quantity,low_stock_threshold,icon')
    .eq('is_active', true)
    .order('stock_quantity')
    .limit(10)

  const actualLowStock = (lowStockProducts || []).filter(
    (p: any) => p.stock_quantity <= p.low_stock_threshold
  )

  const statCards = [
    {
      label: "Today's Revenue",
      value: formatCurrency(stats.todayRevenue),
      sub: `${stats.todayCount} orders today`,
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
          </div>
        ))}
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
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Cashier</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Time</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders.map((order: any) => (
                  <tr key={order.id} className="table-row">
                    <td className="px-5 py-3 text-sm font-semibold text-slate-900">#{order.order_number}</td>
                    <td className="px-5 py-3 text-sm text-slate-500">{order.cashier_profiles?.name || '—'}</td>
                    <td className="px-5 py-3 text-sm text-slate-400">{format(new Date(order.created_at), 'h:mm a')}</td>
                    <td className="px-5 py-3 text-sm font-bold text-slate-900 text-right">{formatCurrency(order.total)}</td>
                  </tr>
                ))}
                {stats.recentOrders.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-slate-400 text-sm">
                      No orders yet today
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
          <div className="p-3 space-y-1">
            {actualLowStock.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-slate-400 font-medium">All stocked up!</p>
                <p className="text-xs text-slate-300 mt-1">No items running low</p>
              </div>
            ) : actualLowStock.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg leading-none">{p.icon || '📦'}</span>
                  <span className="text-sm text-slate-700 font-medium">{p.name}</span>
                </div>
                <span className={`badge ${p.stock_quantity <= 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                  {p.stock_quantity}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
