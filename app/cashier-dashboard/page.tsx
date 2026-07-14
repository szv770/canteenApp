'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ShoppingBag, Users, Star, RefreshCw, ChevronDown } from 'lucide-react'

interface OrderLineItem {
  product_name: string
  quantity: number
}

interface RecentOrder {
  id: string
  created_at: string
  total: number
  status: string
  bochur_name: string | null
  cashier_name: string | null
  item_count: number
  items: OrderLineItem[]
}

export default function CashierDashboardPage() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [ordersToday, setOrdersToday] = useState(0)
  const [studentsToday, setStudentsToday] = useState(0)
  const [topItem, setTopItem] = useState<string | null>(null)
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const now = new Date()
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
    const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()

    const [ordersRes, itemsRes, recentRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id, bochur_id')
        .eq('status', 'completed')
        .gte('created_at', todayStart)
        .lt('created_at', todayEnd),

      supabase
        .from('order_items')
        .select('product_name, quantity, orders!inner(created_at, status)')
        .eq('orders.status', 'completed')
        .gte('orders.created_at', todayStart)
        .lt('orders.created_at', todayEnd),

      supabase
        .from('orders')
        .select('id, created_at, total, status, bochurim!bochur_id(name), cashier_profiles!cashier_id(name), order_items(product_name, quantity)')
        .eq('order_items.is_bundle_component', false)
        .gte('created_at', todayStart)
        .lt('created_at', todayEnd)
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    const orders = ordersRes.data || []
    setOrdersToday(orders.filter(o => o).length)

    const uniqueBochurIds = new Set(orders.map((o: any) => o.bochur_id).filter(Boolean))
    setStudentsToday(uniqueBochurIds.size)

    const itemTotals: Record<string, number> = {}
    for (const item of (itemsRes.data || []) as any[]) {
      itemTotals[item.product_name] = (itemTotals[item.product_name] || 0) + item.quantity
    }
    const top = Object.entries(itemTotals).sort((a, b) => b[1] - a[1])[0]
    setTopItem(top ? `${top[0]} (${top[1]})` : null)

    const recent: RecentOrder[] = (recentRes.data || []).map((o: any) => ({
      id: o.id,
      created_at: o.created_at,
      total: Number(o.total),
      status: o.status,
      bochur_name: (o.bochurim as any)?.name || null,
      cashier_name: (o.cashier_profiles as any)?.name || null,
      item_count: Array.isArray(o.order_items) ? o.order_items.reduce((s: number, i: any) => s + i.quantity, 0) : 0,
      items: Array.isArray(o.order_items) ? o.order_items.map((i: any) => ({ product_name: i.product_name, quantity: i.quantity })) : [],
    }))
    setRecentOrders(recent)

    setLastRefresh(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
    const timer = setInterval(loadData, 60_000)
    return () => clearInterval(timer)
  }, [loadData])

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  const STATUS_BADGE: Record<string, string> = {
    completed: 'bg-green-50 text-green-700',
    voided: 'bg-red-50 text-red-600',
    refunded: 'bg-purple-50 text-purple-600',
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.push('/pos')}
          className="p-2 rounded-xl hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-slate-900">Today's Activity</h1>
          <p className="text-xs text-slate-400">
            Updated {lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="p-2 rounded-xl hover:bg-slate-100 transition-colors"
        >
          <RefreshCw className={`w-5 h-5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center">
            <ShoppingBag className="w-6 h-6 text-amber-500 mx-auto mb-1" />
            {loading ? (
              <div className="h-8 bg-slate-100 rounded animate-pulse mt-1" />
            ) : (
              <p className="text-3xl font-bold text-slate-900">{ordersToday}</p>
            )}
            <p className="text-xs text-slate-400 mt-1">Orders</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center">
            <Users className="w-6 h-6 text-blue-500 mx-auto mb-1" />
            {loading ? (
              <div className="h-8 bg-slate-100 rounded animate-pulse mt-1" />
            ) : (
              <p className="text-3xl font-bold text-slate-900">{studentsToday}</p>
            )}
            <p className="text-xs text-slate-400 mt-1">Students</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center">
            <Star className="w-6 h-6 text-violet-500 mx-auto mb-1" />
            {loading ? (
              <div className="h-5 bg-slate-100 rounded animate-pulse mt-2" />
            ) : (
              <p className="text-sm font-bold text-slate-900 mt-1 leading-tight">{topItem || '—'}</p>
            )}
            <p className="text-xs text-slate-400 mt-1">Top Item</p>
          </div>
        </div>

        {/* Recent orders */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Recent Orders</h2>
          </div>
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">No orders yet today</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentOrders.map(order => {
                const expanded = expandedId === order.id
                return (
                  <div key={order.id}>
                    <button
                      onClick={() => setExpandedId(expanded ? null : order.id)}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {order.bochur_name || 'Walk-in'}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatTime(order.created_at)} · {order.item_count} item{order.item_count !== 1 ? 's' : ''}
                          {order.cashier_name && <> · rung by {order.cashier_name}</>}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[order.status] || 'bg-slate-50 text-slate-500'}`}>
                        {order.status}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-slate-300 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                    {expanded && (
                      <div className="px-4 pb-3 -mt-1">
                        <div className="bg-slate-50 rounded-xl p-3 space-y-1">
                          {order.items.length === 0 ? (
                            <p className="text-xs text-slate-400">No item details</p>
                          ) : (
                            order.items.map((item, i) => (
                              <div key={i} className="flex justify-between text-xs text-slate-600">
                                <span>{item.product_name}</span>
                                <span className="text-slate-400">x{item.quantity}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
