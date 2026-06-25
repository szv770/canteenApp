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
    { label: "Today's Revenue", value: formatCurrency(stats.todayRevenue), sub: `${stats.todayCount} orders`, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { label: "This Week", value: formatCurrency(stats.weekRevenue), sub: `${stats.weekCount} orders`, icon: ShoppingCart, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: "This Month", value: formatCurrency(stats.monthRevenue), sub: `${stats.monthCount} orders`, icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-50' },
    { label: "Bochurim", value: String(stats.bochurimCount), sub: `Avg ${formatCurrency(stats.avgBalance)}`, icon: Users, color: 'text-amber-500', bg: 'bg-amber-50' },
  ]

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(card => (
          <div key={card.label} className="admin-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
              </div>
              <div className={`w-10 h-10 ${card.bg} rounded-xl flex items-center justify-center`}>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent orders */}
        <div className="lg:col-span-2 admin-card">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent Orders</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Order</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Cashier</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Time</th>
                  <th className="text-right text-xs font-medium text-gray-400 px-5 py-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders.map((order: any) => (
                  <tr key={order.id} className="table-row">
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">#{order.order_number}</td>
                    <td className="px-5 py-3 text-sm text-gray-500">{order.cashier_profiles?.name || '—'}</td>
                    <td className="px-5 py-3 text-sm text-gray-400">{format(new Date(order.created_at), 'h:mm a')}</td>
                    <td className="px-5 py-3 text-sm font-semibold text-gray-900 text-right">{formatCurrency(order.total)}</td>
                  </tr>
                ))}
                {stats.recentOrders.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400 text-sm">No orders yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low stock */}
        <div className="admin-card">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h2 className="font-semibold text-gray-900">Low Stock</h2>
          </div>
          <div className="p-4 space-y-2">
            {actualLowStock.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">All stocked up!</p>
            ) : actualLowStock.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{p.icon || '📦'}</span>
                  <span className="text-sm text-gray-700 font-medium">{p.name}</span>
                </div>
                <span className={`badge ${p.stock_quantity <= 0 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
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
