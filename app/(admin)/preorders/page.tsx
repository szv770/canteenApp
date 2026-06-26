'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, Printer, RefreshCw, X, Check, ChevronDown } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const MEAL_PERIODS = ['breakfast', 'lunch', 'dinner', 'snack'] as const
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  ready: 'bg-blue-50 text-blue-700 border-blue-200',
  collected: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
}
const NEXT_STATUS: Record<string, string> = {
  pending: 'ready',
  ready: 'collected',
}

export default function PreordersPage() {
  const supabase = createClient()
  const [orders, setOrders] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [mealFilter, setMealFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => { loadOrders() }, [date, mealFilter])

  useEffect(() => {
    supabase.from('products').select('id, name, price, icon, allow_preorder').eq('allow_preorder', true).eq('is_active', true).order('name')
      .then(({ data }) => setProducts(data || []))
  }, [])

  async function loadOrders() {
    setLoading(true)
    let q = supabase
      .from('pre_orders')
      .select('*, bochurim!bochur_id(name, bochur_id), pre_order_items(*)')
      .eq('scheduled_date', date)
      .order('meal_period')
      .order('created_at')
    if (mealFilter !== 'all') q = q.eq('meal_period', mealFilter)
    const { data, error } = await q
    if (error) toast.error(error.message)
    setOrders(data || [])
    setLoading(false)
  }

  async function advanceStatus(order: any) {
    const next = NEXT_STATUS[order.status]
    if (!next) return
    const { error } = await supabase.from('pre_orders').update({ status: next }).eq('id', order.id)
    if (error) { toast.error(error.message); return }
    toast.success(`Marked as ${next}`)
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: next } : o))
  }

  async function cancelOrder(id: string) {
    if (!confirm('Cancel this pre-order?')) return
    const { error } = await supabase.from('pre_orders').update({ status: 'cancelled' }).eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Pre-order cancelled')
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'cancelled' } : o))
  }

  const filtered = orders.filter(o =>
    !search || (o.bochurim?.name || '').toLowerCase().includes(search.toLowerCase())
  )

  const grouped = MEAL_PERIODS.reduce((acc, mp) => {
    const items = filtered.filter(o => o.meal_period === mp)
    if (items.length > 0) acc[mp] = items
    return acc
  }, {} as Record<string, any[]>)

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Pre-orders</h1>
          <p className="text-slate-500 text-sm mt-1">{filtered.length} orders for {format(new Date(date + 'T12:00:00'), 'MMM d, yyyy')}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={loadOrders} className="btn-secondary text-sm"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => window.print()} className="btn-secondary text-sm"><Printer className="w-4 h-4" /><span className="hidden sm:inline"> Print</span></button>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm"><Plus className="w-4 h-4" /> New Pre-order</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5 print:hidden">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-admin sm:w-44" />
        <select value={mealFilter} onChange={e => setMealFilter(e.target.value)} className="input-admin sm:w-36">
          <option value="all">All meals</option>
          {MEAL_PERIODS.map(mp => <option key={mp} value={mp}>{mp.charAt(0).toUpperCase() + mp.slice(1)}</option>)}
        </select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name..." className="input-admin pl-9" />
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-6">
        <h2 className="text-xl font-bold">Pre-orders — {format(new Date(date + 'T12:00:00'), 'MMMM d, yyyy')}</h2>
        {mealFilter !== 'all' && <p className="text-sm capitalize">{mealFilter}</p>}
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">No pre-orders for this date</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([meal, items]) => (
            <div key={meal}>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3 capitalize">{meal} ({items.length})</h3>
              <div className="admin-card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-2.5">Student</th>
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-2.5">Items</th>
                      <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-2.5">Total</th>
                      <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-2.5">Status</th>
                      <th className="print:hidden text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(order => (
                      <tr key={order.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-900">{order.bochurim?.name || '—'}</p>
                          {order.notes && <p className="text-xs text-slate-400 mt-0.5">{order.notes}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            {(order.pre_order_items || []).map((item: any) => (
                              <p key={item.id} className="text-sm text-slate-700">
                                {item.quantity}× {item.product_name}
                              </p>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900 text-right">{formatCurrency(order.total)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`badge border ${STATUS_COLORS[order.status] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="print:hidden px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {NEXT_STATUS[order.status] && (
                              <button onClick={() => advanceStatus(order)}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                title={`Mark as ${NEXT_STATUS[order.status]}`}>
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            {order.status !== 'cancelled' && order.status !== 'collected' && (
                              <button onClick={() => cancelOrder(order.id)}
                                className="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors"
                                title="Cancel">
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddPreorderModal
          products={products}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); loadOrders() }}
          defaultDate={date}
        />
      )}
    </div>
  )
}

function AddPreorderModal({ products, onClose, onSaved, defaultDate }: {
  products: any[]
  onClose: () => void
  onSaved: () => void
  defaultDate: string
}) {
  const supabase = createClient()
  const [bochurQuery, setBochurQuery] = useState('')
  const [bochurResults, setBochurResults] = useState<any[]>([])
  const [selectedBochur, setSelectedBochur] = useState<any>(null)
  const [date, setDate] = useState(defaultDate)
  const [meal, setMeal] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('lunch')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<{ product_id: string; product_name: string; unit_price: number; quantity: number }[]>([])
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout>()

  function searchBochur(q: string) {
    setBochurQuery(q)
    clearTimeout(debounceRef.current)
    if (!q.trim()) { setBochurResults([]); return }
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase.from('bochurim_with_id').select('id, name, bochur_id').or(`name.ilike.%${q}%,bochur_id.ilike.%${q}%`).eq('archived', false).limit(5)
      setBochurResults(data || [])
    }, 220)
  }

  function addItem(product: any) {
    setItems(prev => {
      const existing = prev.find(i => i.product_id === product.id)
      if (existing) return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { product_id: product.id, product_name: product.name, unit_price: product.price, quantity: 1 }]
    })
  }

  function updateQty(product_id: string, qty: number) {
    if (qty <= 0) { setItems(prev => prev.filter(i => i.product_id !== product_id)); return }
    setItems(prev => prev.map(i => i.product_id === product_id ? { ...i, quantity: qty } : i))
  }

  const total = items.reduce((s, i) => s + i.unit_price * i.quantity, 0)

  async function save() {
    if (!selectedBochur) { toast.error('Select a student'); return }
    if (items.length === 0) { toast.error('Add at least one item'); return }
    setSaving(true)
    const { data: order, error } = await supabase.from('pre_orders')
      .insert({ bochur_id: selectedBochur.id, scheduled_date: date, meal_period: meal, notes: notes || null, total })
      .select('id').single()
    if (error || !order) { toast.error(error?.message || 'Failed'); setSaving(false); return }
    await supabase.from('pre_order_items').insert(items.map(i => ({ ...i, pre_order_id: order.id })))
    toast.success('Pre-order created')
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
          <h2 className="font-bold text-slate-900">New Pre-order</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Student search */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Student *</label>
            {selectedBochur ? (
              <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <span className="text-sm font-semibold text-amber-800">{selectedBochur.name}</span>
                <button onClick={() => setSelectedBochur(null)} className="p-1 hover:bg-amber-100 rounded-lg"><X className="w-4 h-4 text-amber-600" /></button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={bochurQuery} onChange={e => searchBochur(e.target.value)} placeholder="Search by name or ID..." className="input-admin pl-9" />
                {bochurResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-xl z-10">
                    {bochurResults.map(b => (
                      <button key={b.id} onMouseDown={() => { setSelectedBochur(b); setBochurQuery(''); setBochurResults([]) }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-left border-b border-slate-50 last:border-0">
                        <span className="text-sm font-semibold text-slate-900">{b.name}</span>
                        <span className="text-xs text-slate-400">{b.bochur_id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-admin" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Meal</label>
              <select value={meal} onChange={e => setMeal(e.target.value as any)} className="input-admin">
                {MEAL_PERIODS.map(mp => <option key={mp} value={mp}>{mp.charAt(0).toUpperCase() + mp.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Items</label>
            {products.length === 0 ? (
              <p className="text-sm text-slate-400 p-3 bg-slate-50 rounded-xl">No products with pre-ordering enabled. Enable "Allow pre-ordering" on products first.</p>
            ) : (
              <div className="flex flex-wrap gap-2 mb-3">
                {products.map(p => (
                  <button key={p.id} onClick={() => addItem(p)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-sm hover:bg-amber-50 hover:border-amber-300 transition-colors">
                    {p.icon && <span>{p.icon}</span>}
                    <span>{p.name}</span>
                    <span className="text-slate-400">{formatCurrency(p.price)}</span>
                  </button>
                ))}
              </div>
            )}
            {items.length > 0 && (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                {items.map(item => (
                  <div key={item.product_id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="flex-1 text-sm text-slate-700">{item.product_name}</span>
                    <span className="text-sm text-slate-500">{formatCurrency(item.unit_price)}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(item.product_id, item.quantity - 1)} className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-sm font-bold flex items-center justify-center">−</button>
                      <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                      <button onClick={() => updateQty(item.product_id, item.quantity + 1)} className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-sm font-bold flex items-center justify-center">+</button>
                    </div>
                    <button onClick={() => updateQty(item.product_id, 0)} className="p-1 text-slate-300 hover:text-red-400 transition-colors"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <div className="flex justify-between px-3 py-2.5 bg-slate-50">
                  <span className="text-sm font-semibold text-slate-700">Total</span>
                  <span className="text-sm font-bold text-slate-900">{formatCurrency(total)}</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any special requests..." className="input-admin" />
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Create Pre-order'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
