'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, Download, RefreshCw, X, Eye, RotateCcw } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import RefundRequestsPage from '../refund-requests/page'
import BochurProfileModal from '../bochurim/BochurProfileModal'
import ProductQuickViewModal from '@/components/admin/ProductQuickViewModal'
import CashierQuickViewModal from '@/components/admin/CashierQuickViewModal'
import type { BochurWithId, AccountType } from '@/types/database'

// ─── Student profile panel (fetch-by-id wrapper around BochurProfileModal) ────
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

type TxTab = 'orders' | 'refunds'

function TransactionsHub() {
  const [tab, setTab] = useState<TxTab>('orders')
  return (
    <div>
      <div className="flex gap-1 px-4 sm:px-6 pt-4 sm:pt-6 border-b border-slate-200">
        {([
          { key: 'orders', label: 'Orders' },
          { key: 'refunds', label: 'Refund Requests' },
        ] as { key: TxTab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold -mb-px border-b-2 transition-colors ${
              tab === t.key
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'orders' && <OrdersContent />}
      {tab === 'refunds' && <RefundRequestsPage />}
    </div>
  )
}

export default function TransactionsPage() {
  return <TransactionsHub />
}

function OrdersContent() {
  const supabase = createClient()
  const [orders, setOrders] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [products, setProducts] = useState<{ id: string; name: string }[]>([])
  const [productFilter, setProductFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [viewOrder, setViewOrder] = useState<any | null>(null)
  const [refundOrder, setRefundOrder] = useState<any | null>(null)
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([])
  const [viewCashierId, setViewCashierId] = useState<string | null>(null)
  const [viewBochurId, setViewBochurId] = useState<string | null>(null)

  useEffect(() => { loadOrders() }, [statusFilter, productFilter])

  useEffect(() => {
    supabase.from('account_types').select('*').eq('is_active', true).order('name')
      .then(({ data }) => setAccountTypes((data || []) as AccountType[]))
    supabase.from('products').select('id, name').order('name')
      .then(({ data }) => setProducts((data || []) as { id: string; name: string }[]))
  }, [])

  async function loadOrders() {
    setLoading(true)

    // When filtering by product, look up which orders actually contain it
    // first (any order_items row for that product_id, bundle component or
    // not — a bundle purchase still means that product was bought/consumed)
    // — then fetch exactly those orders, ignoring the usual recency cap so a
    // product search covers the full history, not just the latest 200.
    let matchedOrderIds: string[] | null = null
    let qtyByOrderId: Record<string, number> = {}
    if (productFilter) {
      const { data: items, error: itemsErr } = await supabase
        .from('order_items')
        .select('order_id, quantity')
        .eq('product_id', productFilter)
      if (itemsErr) toast.error('Failed to search by product: ' + itemsErr.message)
      for (const i of (items || []) as any[]) {
        qtyByOrderId[i.order_id] = (qtyByOrderId[i.order_id] || 0) + Number(i.quantity)
      }
      matchedOrderIds = Object.keys(qtyByOrderId)
      if (matchedOrderIds.length === 0) {
        setOrders([])
        setLoading(false)
        return
      }
    }

    // Fetch orders without bochurim join so walk-in orders (null bochur_id) are never filtered out
    let q = supabase
      .from('orders')
      .select('*, cashier_profiles!cashier_id(name)')
      .order('created_at', { ascending: false })

    if (matchedOrderIds) q = q.in('id', matchedOrderIds)
    else q = q.limit(200)
    if (statusFilter !== 'all') q = q.eq('status', statusFilter)

    const { data: ordersData, error } = await q
    if (error) toast.error('Failed to load transactions: ' + error.message)

    // Separately look up bochur names for orders that have a bochur_id
    const bochurIds = Array.from(new Set((ordersData || []).filter((o: any) => o.bochur_id).map((o: any) => o.bochur_id))) as string[]
    let bochurMap: Record<string, { name: string; bochur_number: string | null }> = {}
    if (bochurIds.length > 0) {
      const { data: bochurimData } = await supabase
        .from('bochurim')
        .select('id, name, bochur_number')
        .in('id', bochurIds)
      if (bochurimData) {
        bochurMap = Object.fromEntries(bochurimData.map((b: any) => [b.id, { name: b.name, bochur_number: b.bochur_number }]))
      }
    }

    const merged = (ordersData || []).map((o: any) => ({
      ...o,
      bochurim: o.bochur_id ? (bochurMap[o.bochur_id] ?? null) : null,
      matchedQty: qtyByOrderId[o.id],
    }))

    setOrders(merged)
    setLoading(false)
  }

  const filtered = orders.filter(o =>
    String(o.order_number).includes(search) ||
    (o.cashier_profiles?.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (o.bochurim?.name || '').toLowerCase().includes(search.toLowerCase())
  )
  const productFilterName = products.find(p => p.id === productFilter)?.name

  async function voidOrder(order: any) {
    if (!confirm(`Void order #${order.order_number}? Any balance payment will be refunded.`)) return
    const res = await fetch('/api/pos/void-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: order.id }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error || 'Failed to void order'); return }
    toast.success('Order voided' + (json.refunded ? ` — $${json.refunded} refunded to balance` : ''))
    loadOrders()
  }

  function exportCSV() {
    const rows = [
      ['Order #', 'Date', 'Cashier', 'Bochur', 'Total', 'Status'],
      ...filtered.map(o => [
        o.order_number,
        format(new Date(o.created_at), 'MM/dd/yyyy HH:mm'),
        o.cashier_profiles?.name || '',
        o.bochurim?.name || 'Walk-in',
        o.total,
        o.status,
      ])
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
  }

  const statusBadge: Record<string, string> = {
    completed: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
    voided: 'bg-slate-100 text-slate-500 border border-slate-200',
    refunded: 'bg-red-50 text-red-600 border border-red-100',
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Transactions</h1>
          <p className="text-slate-500 text-sm mt-1">{filtered.length} orders</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={loadOrders} className="btn-secondary text-sm"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={exportCSV} className="btn-secondary text-sm"><Download className="w-4 h-4" /> <span className="hidden sm:inline">Export CSV</span></button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders..." className="input-admin pl-9" />
        </div>
        <select value={productFilter} onChange={e => setProductFilter(e.target.value)} className="input-admin sm:w-48">
          <option value="">All products</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-admin sm:w-36">
          <option value="all">All status</option>
          <option value="completed">Completed</option>
          <option value="voided">Voided</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

      {productFilter && (
        <div className="mb-4 flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5 text-sm">
          <span className="text-indigo-700">
            Showing every order that included <span className="font-semibold">{productFilterName}</span> — {filtered.length} order{filtered.length === 1 ? '' : 's'}
          </span>
          <button onClick={() => setProductFilter('')} className="text-indigo-500 hover:text-indigo-700 font-medium">Clear</button>
        </div>
      )}

      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Order</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Date</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Cashier</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Bochur</th>
              <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Status</th>
              {productFilter && (
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Qty</th>
              )}
              <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Total</th>
              <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={productFilter ? 8 : 7} className="px-5 py-12 text-center text-slate-400 text-sm">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={productFilter ? 8 : 7} className="px-5 py-12 text-center text-slate-400 text-sm">No transactions found</td></tr>
            ) : filtered.map(o => (
              <tr key={o.id} className="table-row">
                <td className="px-5 py-3 text-sm font-semibold text-slate-900">#{o.order_number}</td>
                <td className="px-5 py-3 text-sm text-slate-500">{format(new Date(o.created_at), 'MM/dd HH:mm')}</td>
                <td className="px-5 py-3 text-sm text-slate-700">
                  {o.cashier_profiles?.name ? (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setViewCashierId(o.cashier_id) }}
                      className="hover:underline hover:text-indigo-600 text-left"
                    >
                      {o.cashier_profiles.name}
                    </button>
                  ) : '—'}
                </td>
                <td className="px-5 py-3 text-sm text-slate-700">
                  {o.bochurim?.name ? (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setViewBochurId(o.bochur_id) }}
                      className="hover:underline hover:text-indigo-600 text-left"
                    >
                      {o.bochurim.name}
                    </button>
                  ) : <span className="text-slate-400">Walk-in / No account</span>}
                </td>
                <td className="px-5 py-3 text-center">
                  <span className={`badge ${statusBadge[o.status] || 'bg-slate-100 text-slate-500'}`}>{o.status}</span>
                </td>
                {productFilter && (
                  <td className="px-5 py-3 text-sm font-semibold text-slate-700 text-right">{o.matchedQty}</td>
                )}
                <td className="px-5 py-3 text-sm font-bold text-slate-900 text-right">{formatCurrency(o.total)}</td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {o.status === 'completed' && (
                      <button onClick={() => setRefundOrder(o)} className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-100 rounded-lg transition-colors">
                        <RotateCcw className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Request Refund</span>
                      </button>
                    )}
                    <button onClick={() => setViewOrder(o)} className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-lg transition-colors">
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {viewOrder && (
        <OrderDetailModal
          order={viewOrder}
          onClose={() => setViewOrder(null)}
          onVoid={() => { voidOrder(viewOrder); setViewOrder(null) }}
        />
      )}

      {refundOrder && (
        <RefundRequestModal
          order={refundOrder}
          onClose={() => setRefundOrder(null)}
        />
      )}

      {viewCashierId && (
        <CashierQuickViewModal cashierId={viewCashierId} onClose={() => setViewCashierId(null)} />
      )}

      {viewBochurId && (
        <StudentProfilePanel
          bochurId={viewBochurId}
          accountTypes={accountTypes}
          onClose={() => setViewBochurId(null)}
        />
      )}
    </div>
  )
}

function RefundRequestModal({ order, onClose }: { order: any; onClose: () => void }) {
  const supabase = createClient()
  const [items, setItems] = useState<any[]>([])
  const [amount, setAmount] = useState(String(order.total ?? ''))
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [viewProductId, setViewProductId] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('order_items').select('*').eq('order_id', order.id).eq('is_bundle_component', false).then(({ data }) => setItems(data || []))
  }, [order.id])

  async function submit() {
    if (submitting) return
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { toast.error('Enter a valid refund amount'); return }
    if (!reason.trim()) { toast.error('Reason is required'); return }

    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('refund_requests').insert({
        order_id: order.id,
        amount: amt,
        reason: reason.trim(),
        status: 'pending',
        requested_by: user?.id ?? null,
      })
      if (error) throw error
      toast.success('Refund request submitted')
      onClose()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit refund request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md animate-scale-in max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0">
          <h2 className="font-bold text-slate-900">Request Refund — #{order.order_number}</h2>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-slate-100 rounded-xl"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          <div className="bg-slate-50 rounded-xl p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Order total</span>
              <span className="font-bold text-slate-900">{formatCurrency(order.total)}</span>
            </div>
            {items.map(item => (
              <div key={item.id} className="flex justify-between text-xs text-slate-500">
                <span>
                  {item.quantity}x{' '}
                  {item.product_id ? (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setViewProductId(item.product_id) }}
                      className="hover:underline hover:text-indigo-600 text-left"
                    >
                      {item.product_name}
                    </button>
                  ) : item.product_name}
                  {item.variant_label ? ` (${item.variant_label})` : ''}
                </span>
                <span>{formatCurrency(item.total)}</span>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Amount to refund</label>
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="input-admin"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Reason <span className="text-red-500">*</span></label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this refund needed?"
              className="input-admin resize-none"
            />
          </div>

          <button
            onClick={submit}
            disabled={submitting || !reason.trim() || !amount}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'Submit Refund Request'}
          </button>
        </div>
      </div>

      {viewProductId && (
        <ProductQuickViewModal productId={viewProductId} onClose={() => setViewProductId(null)} />
      )}
    </div>
  )
}

function OrderDetailModal({ order, onClose, onVoid }: { order: any; onClose: () => void; onVoid: () => void }) {
  const supabase = createClient()
  const [items, setItems] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [viewProductId, setViewProductId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('order_items').select('*').eq('order_id', order.id).eq('is_bundle_component', false),
      supabase.from('payments').select('*').eq('order_id', order.id),
    ]).then(([i, p]) => { setItems(i.data || []); setPayments(p.data || []) })
  }, [order.id])

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md animate-scale-in max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0">
          <h2 className="font-bold text-slate-900">Order #{order.order_number}</h2>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-slate-100 rounded-xl"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          <div className="space-y-1">
            {items.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-slate-700">
                  {item.quantity}x{' '}
                  {item.product_id ? (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setViewProductId(item.product_id) }}
                      className="hover:underline hover:text-indigo-600 text-left"
                    >
                      {item.product_name}
                    </button>
                  ) : item.product_name}
                  {item.variant_label ? ` (${item.variant_label})` : ''}
                </span>
                <span className="font-medium text-slate-900">{formatCurrency(item.total)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-100 pt-3 space-y-1">
            {payments.map(p => (
              <div key={p.id} className="flex justify-between text-sm">
                <span className="text-slate-500 capitalize">{p.method.replace('_', ' ')}</span>
                <span className="font-medium">{formatCurrency(p.amount)}</span>
              </div>
            ))}
            {order.tip_amount > 0 && (
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Tip (included above)</span>
                <span className="font-medium">{formatCurrency(order.tip_amount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-slate-900 pt-1">
              <span>Order Total</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
          </div>
          {order.status === 'completed' && (
            <button onClick={onVoid} className="btn-danger w-full text-sm">Void Order</button>
          )}
        </div>
      </div>

      {viewProductId && (
        <ProductQuickViewModal productId={viewProductId} onClose={() => setViewProductId(null)} />
      )}
    </div>
  )
}
