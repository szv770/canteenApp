'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, Download, RefreshCw, X, Eye } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export default function TransactionsPage() {
  const supabase = createClient()
  const [orders, setOrders] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('completed')
  const [loading, setLoading] = useState(true)
  const [viewOrder, setViewOrder] = useState<any | null>(null)

  useEffect(() => { loadOrders() }, [statusFilter])

  async function loadOrders() {
    setLoading(true)
    const q = supabase
      .from('orders')
      .select('*, cashier_profiles(name), bochurim(name,bochur_number)')
      .order('created_at', { ascending: false })
      .limit(200)

    if (statusFilter !== 'all') q.eq('status', statusFilter)

    const { data } = await q
    setOrders(data || [])
    setLoading(false)
  }

  const filtered = orders.filter(o =>
    String(o.order_number).includes(search) ||
    (o.cashier_profiles?.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (o.bochurim?.name || '').toLowerCase().includes(search.toLowerCase())
  )

  async function voidOrder(order: any) {
    if (!confirm(`Void order #${order.order_number}?`)) return
    const { error } = await supabase.from('orders').update({ status: 'voided' }).eq('id', order.id)
    if (error) { toast.error(error.message); return }
    toast.success('Order voided')
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
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-admin sm:w-36">
          <option value="all">All status</option>
          <option value="completed">Completed</option>
          <option value="voided">Voided</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

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
              <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Total</th>
              <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400 text-sm">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400 text-sm">No transactions found</td></tr>
            ) : filtered.map(o => (
              <tr key={o.id} className="table-row">
                <td className="px-5 py-3 text-sm font-semibold text-slate-900">#{o.order_number}</td>
                <td className="px-5 py-3 text-sm text-slate-500">{format(new Date(o.created_at), 'MM/dd HH:mm')}</td>
                <td className="px-5 py-3 text-sm text-slate-700">{o.cashier_profiles?.name || '—'}</td>
                <td className="px-5 py-3 text-sm text-slate-700">{o.bochurim?.name || <span className="text-slate-400">Walk-in</span>}</td>
                <td className="px-5 py-3 text-center">
                  <span className={`badge ${statusBadge[o.status] || 'bg-slate-100 text-slate-500'}`}>{o.status}</span>
                </td>
                <td className="px-5 py-3 text-sm font-bold text-slate-900 text-right">{formatCurrency(o.total)}</td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
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
    </div>
  )
}

function OrderDetailModal({ order, onClose, onVoid }: { order: any; onClose: () => void; onVoid: () => void }) {
  const supabase = createClient()
  const [items, setItems] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('order_items').select('*').eq('order_id', order.id),
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
                <span className="text-slate-700">{item.quantity}x {item.product_name}{item.variant_label ? ` (${item.variant_label})` : ''}</span>
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
            <div className="flex justify-between font-bold text-slate-900 pt-1">
              <span>Total</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
          </div>
          {order.status === 'completed' && (
            <button onClick={onVoid} className="btn-danger w-full text-sm">Void Order</button>
          )}
        </div>
      </div>
    </div>
  )
}
