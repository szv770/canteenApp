'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ShoppingBag, Users, Star, RefreshCw, ChevronDown } from 'lucide-react'
import ProductQuickViewModal from '@/components/admin/ProductQuickViewModal'
import CashierQuickViewModal from '@/components/admin/CashierQuickViewModal'
import BochurProfileModal from '../(admin)/bochurim/BochurProfileModal'
import type { BochurWithId, AccountType } from '@/types/database'

interface OrderLineItem {
  product_id: string | null
  product_name: string
  quantity: number
}

interface RecentOrder {
  id: string
  created_at: string
  total: number
  status: string
  bochur_id: string | null
  bochur_name: string | null
  cashier_id: string | null
  cashier_name: string | null
  item_count: number
  items: OrderLineItem[]
}

// Fetch-by-id wrapper so the Bochur profile modal (needs a full row, not just an id) can be
// opened from a quick-view trigger. Same pattern as reports/page.tsx's StudentProfilePanel.
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
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([])
  const [viewBochurId, setViewBochurId] = useState<string | null>(null)
  const [viewCashierId, setViewCashierId] = useState<string | null>(null)
  const [viewProductId, setViewProductId] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('account_types').select('*').eq('is_active', true).order('name')
      .then(({ data }) => setAccountTypes((data || []) as AccountType[]))
  }, [])

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
        .select('id, created_at, total, status, bochur_id, cashier_id, bochurim!bochur_id(name), cashier_profiles!cashier_id(name), order_items(product_id, product_name, quantity)')
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
      bochur_id: o.bochur_id || null,
      bochur_name: (o.bochurim as any)?.name || null,
      cashier_id: o.cashier_id || null,
      cashier_name: (o.cashier_profiles as any)?.name || null,
      item_count: Array.isArray(o.order_items) ? o.order_items.reduce((s: number, i: any) => s + i.quantity, 0) : 0,
      items: Array.isArray(o.order_items) ? o.order_items.map((i: any) => ({ product_id: i.product_id || null, product_name: i.product_name, quantity: i.quantity })) : [],
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
                    {/* Rendered as a div (not a button) since the bochur/cashier names below are
                        clickable buttons themselves — nested <button> elements are invalid HTML. */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedId(expanded ? null : order.id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setExpandedId(expanded ? null : order.id) }}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {order.bochur_id && order.bochur_name ? (
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); setViewBochurId(order.bochur_id!) }}
                              className="hover:underline hover:text-indigo-600 text-left"
                            >
                              {order.bochur_name}
                            </button>
                          ) : (
                            order.bochur_name || 'Walk-in'
                          )}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatTime(order.created_at)} · {order.item_count} item{order.item_count !== 1 ? 's' : ''}
                          {order.cashier_name && (
                            <>
                              {' '}· rung by{' '}
                              {order.cashier_id ? (
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); setViewCashierId(order.cashier_id!) }}
                                  className="hover:underline hover:text-indigo-600"
                                >
                                  {order.cashier_name}
                                </button>
                              ) : order.cashier_name}
                            </>
                          )}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[order.status] || 'bg-slate-50 text-slate-500'}`}>
                        {order.status}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-slate-300 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </div>
                    {expanded && (
                      <div className="px-4 pb-3 -mt-1">
                        <div className="bg-slate-50 rounded-xl p-3 space-y-1">
                          {order.items.length === 0 ? (
                            <p className="text-xs text-slate-400">No item details</p>
                          ) : (
                            order.items.map((item, i) => (
                              <div key={i} className="flex justify-between text-xs text-slate-600">
                                {item.product_id ? (
                                  <button
                                    type="button"
                                    onClick={() => setViewProductId(item.product_id!)}
                                    className="hover:underline hover:text-indigo-600 text-left"
                                  >
                                    {item.product_name}
                                  </button>
                                ) : (
                                  <span>{item.product_name}</span>
                                )}
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

      {viewBochurId && (
        <StudentProfilePanel
          bochurId={viewBochurId}
          accountTypes={accountTypes}
          onClose={() => setViewBochurId(null)}
        />
      )}
      {viewCashierId && (
        <CashierQuickViewModal cashierId={viewCashierId} onClose={() => setViewCashierId(null)} />
      )}
      {viewProductId && (
        <ProductQuickViewModal productId={viewProductId} onClose={() => setViewProductId(null)} />
      )}
    </div>
  )
}
