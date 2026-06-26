'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, ChevronDown, ChevronRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export default function PurchaseOrdersPage() {
  const supabase = createClient()
  const [orders, setOrders] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [ordersRes, productsRes] = await Promise.all([
      supabase.from('purchase_orders').select('*, purchase_order_items(*), cashier_profiles!created_by(name)').order('created_at', { ascending: false }).limit(100),
      supabase.from('products').select('id, name, icon, stock_quantity').eq('is_active', true).order('name'),
    ])
    if (ordersRes.error) toast.error(ordersRes.error.message)
    setOrders(ordersRes.data || [])
    setProducts(productsRes.data || [])
    setLoading(false)
  }

  const totalItems = orders.reduce((s, o) => s + (o.purchase_order_items?.length || 0), 0)
  const totalValue = orders.reduce((s, o) => s + (o.total_cost || 0), 0)

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Purchase Orders</h1>
          <p className="text-slate-500 text-sm mt-1">{orders.length} purchases · {totalItems} line items · {formatCurrency(totalValue)} total cost</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-sm"><Plus className="w-4 h-4" /> Log Purchase</button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-slate-400">No purchases logged yet</div>
      ) : (
        <div className="space-y-3">
          {orders.map(po => (
            <div key={po.id} className="admin-card overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === po.id ? null : po.id)}
                className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors text-left"
              >
                {expanded === po.id ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">{po.supplier || 'Unknown supplier'}</span>
                    <span className="text-xs text-slate-400">{format(new Date(po.created_at), 'MMM d, yyyy')}</span>
                    {po.cashier_profiles?.name && <span className="text-xs text-slate-400">by {po.cashier_profiles.name}</span>}
                  </div>
                  {po.notes && <p className="text-xs text-slate-400 mt-0.5 truncate">{po.notes}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-slate-900">{formatCurrency(po.total_cost)}</p>
                  <p className="text-xs text-slate-400">{po.purchase_order_items?.length || 0} items</p>
                </div>
              </button>
              {expanded === po.id && (
                <div className="border-t border-slate-100">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase px-4 py-2">Product</th>
                        <th className="text-right text-xs font-semibold text-slate-400 uppercase px-4 py-2">Qty Added</th>
                        <th className="text-right text-xs font-semibold text-slate-400 uppercase px-4 py-2">Unit Cost</th>
                        <th className="text-right text-xs font-semibold text-slate-400 uppercase px-4 py-2">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(po.purchase_order_items || []).map((item: any) => (
                        <tr key={item.id} className="border-t border-slate-50">
                          <td className="px-4 py-2.5 text-sm text-slate-700">{item.product_name}</td>
                          <td className="px-4 py-2.5 text-sm text-slate-700 text-right">+{item.quantity_added}</td>
                          <td className="px-4 py-2.5 text-sm text-slate-700 text-right">{formatCurrency(item.unit_cost)}</td>
                          <td className="px-4 py-2.5 text-sm font-semibold text-slate-900 text-right">{formatCurrency(item.unit_cost * item.quantity_added)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddPurchaseModal
          products={products}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); loadData() }}
        />
      )}
    </div>
  )
}

type LineItem = { product_id: string; product_name: string; quantity_added: number; unit_cost: number }

function AddPurchaseModal({ products, onClose, onSaved }: { products: any[]; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const [supplier, setSupplier] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<LineItem[]>([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const filteredProducts = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  )

  function addItem(product: any) {
    if (items.find(i => i.product_id === product.id)) return
    setItems(prev => [...prev, { product_id: product.id, product_name: product.name, quantity_added: 1, unit_cost: 0 }])
    setSearch('')
  }

  function update(idx: number, field: keyof LineItem, value: string | number) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  function remove(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)) }

  const totalCost = items.reduce((s, i) => s + i.quantity_added * i.unit_cost, 0)

  async function save() {
    if (items.length === 0) { toast.error('Add at least one item'); return }
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    const { data: po, error } = await supabase.from('purchase_orders')
      .insert({ supplier: supplier.trim() || null, notes: notes.trim() || null, total_cost: totalCost, created_by: user?.id || null })
      .select('id').single()
    if (error || !po) { toast.error(error?.message || 'Failed'); setSaving(false); return }

    await supabase.from('purchase_order_items').insert(items.map(i => ({ ...i, po_id: po.id })))

    // Update stock quantities
    for (const item of items) {
      if (item.product_id && item.quantity_added > 0) {
        const prod = products.find(p => p.id === item.product_id)
        if (prod) {
          await supabase.from('products').update({ stock_quantity: (prod.stock_quantity || 0) + item.quantity_added }).eq('id', item.product_id)
        }
      }
    }

    toast.success('Purchase logged & stock updated')
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-xl max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
          <h2 className="font-bold text-slate-900">Log Purchase</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Supplier</label>
              <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="e.g. Costco" className="input-admin" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Invoice #, etc." className="input-admin" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Add products</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products to add..." className="input-admin mb-2" />
            {search && (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-40 overflow-y-auto">
                {filteredProducts.slice(0, 8).map(p => (
                  <button key={p.id} onClick={() => addItem(p)}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-left text-sm ${items.find(i => i.product_id === p.id) ? 'opacity-40 pointer-events-none' : ''}`}>
                    {p.icon && <span>{p.icon}</span>}
                    <span className="flex-1">{p.name}</span>
                    <span className="text-slate-400 text-xs">Stock: {p.stock_quantity}</span>
                  </button>
                ))}
                {filteredProducts.length === 0 && <p className="px-3 py-2.5 text-sm text-slate-400">No products found</p>}
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_90px_32px] gap-2 px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-400 uppercase">
                <span>Product</span><span className="text-center">Qty</span><span className="text-center">Unit Cost</span><span />
              </div>
              {items.map((item, idx) => (
                <div key={item.product_id} className="grid grid-cols-[1fr_80px_90px_32px] gap-2 items-center px-3 py-2.5 border-t border-slate-100">
                  <span className="text-sm text-slate-700 truncate">{item.product_name}</span>
                  <input type="number" min={0} value={item.quantity_added} onChange={e => update(idx, 'quantity_added', parseInt(e.target.value) || 0)}
                    className="input-admin text-sm text-center" />
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <input type="number" min={0} step={0.01} value={item.unit_cost} onChange={e => update(idx, 'unit_cost', parseFloat(e.target.value) || 0)}
                      className="input-admin text-sm pl-6" />
                  </div>
                  <button onClick={() => remove(idx)} className="flex items-center justify-center w-8 h-8 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex justify-between px-3 py-3 bg-slate-50 border-t border-slate-100">
                <span className="text-sm font-semibold text-slate-700">Total Cost</span>
                <span className="text-sm font-bold text-slate-900">{formatCurrency(totalCost)}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Log Purchase & Update Stock'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
