'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, X, TrendingDown } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { Product, Supplier } from '@/types/database'

type SlowMover = Product & { last_sale_date: string | null }

function daysSince(dateStr: string | null): string {
  if (!dateStr) return 'Never sold'
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
  return `${days}d ago`
}

export default function InventoryPage() {
  const supabase = createClient()
  const [products, setProducts] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [restockProduct, setRestockProduct] = useState<Product | null>(null)
  const [view, setView] = useState<'all' | 'slow'>('all')
  const [slowMovers, setSlowMovers] = useState<SlowMover[]>([])
  const [slowLoading, setSlowLoading] = useState(false)
  const [slowLoaded, setSlowLoaded] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [pRes, sRes] = await Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('name'),
      supabase.from('suppliers').select('*').order('name'),
    ])
    setProducts(pRes.data || [])
    setSuppliers(sRes.data || [])
    setLoading(false)
    setSlowLoaded(false) // reset slow cache when products reload
  }

  async function loadSlowMovers(allProducts: Product[]) {
    setSlowLoading(true)
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

      // Step 1: get order IDs from last 30 days
      const { data: recentOrders } = await supabase
        .from('orders')
        .select('id')
        .gte('created_at', thirtyDaysAgo)

      const recentOrderIds = (recentOrders || []).map((o: any) => o.id)

      // Step 2: get product IDs sold in those orders
      let soldProductIds = new Set<string>()
      if (recentOrderIds.length > 0) {
        const { data: recentItems } = await supabase
          .from('order_items')
          .select('product_id')
          .in('order_id', recentOrderIds)
        soldProductIds = new Set((recentItems || []).map((i: any) => i.product_id))
      }

      // Step 3: filter to stocked, active products not sold recently
      const candidates = allProducts.filter(p =>
        p.is_active &&
        p.stock_quantity !== null &&
        p.stock_quantity > 0 &&
        !soldProductIds.has(p.id)
      )

      if (candidates.length === 0) {
        setSlowMovers([])
        setSlowLoaded(true)
        return
      }

      // Step 4: get last sale date for each candidate
      const { data: lastSaleItems } = await supabase
        .from('order_items')
        .select('product_id, orders!order_id(created_at)')
        .in('product_id', candidates.map(p => p.id))

      const lastSaleMap: Record<string, string> = {}
      if (lastSaleItems) {
        for (const item of lastSaleItems as any[]) {
          const d = item.orders?.created_at
          if (d && (!lastSaleMap[item.product_id] || d > lastSaleMap[item.product_id])) {
            lastSaleMap[item.product_id] = d
          }
        }
      }

      const slow: SlowMover[] = candidates.map(p => ({
        ...p,
        last_sale_date: lastSaleMap[p.id] || null,
      }))

      // Sort: never sold first, then by last sale date ascending (oldest first)
      slow.sort((a, b) => {
        if (!a.last_sale_date && !b.last_sale_date) return 0
        if (!a.last_sale_date) return -1
        if (!b.last_sale_date) return 1
        return a.last_sale_date < b.last_sale_date ? -1 : 1
      })

      setSlowMovers(slow)
      setSlowLoaded(true)
    } finally {
      setSlowLoading(false)
    }
  }

  function switchToSlow() {
    setView('slow')
    if (!slowLoaded) {
      loadSlowMovers(products)
    }
  }

  const filtered = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
  const filteredSlow = slowMovers.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  const slowTotalCost = slowMovers.reduce((sum, p) => sum + (p.stock_quantity ?? 0) * (p.cost_price ?? 0), 0)

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-500 text-sm mt-1">Track stock levels and restock products</p>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setView('all')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            view === 'all'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-amber-300'
          }`}
        >
          All Stock
        </button>
        <button
          onClick={switchToSlow}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            view === 'slow'
              ? 'bg-orange-500 text-white shadow-sm'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-orange-300'
          }`}
        >
          <TrendingDown className="w-4 h-4" />
          Slow Movers
        </button>
      </div>

      {/* Slow movers summary banner */}
      {view === 'slow' && !slowLoading && slowLoaded && (
        <div className={`mb-4 p-4 rounded-xl border ${
          slowMovers.length === 0
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-orange-50 border-orange-200 text-orange-800'
        }`}>
          {slowMovers.length === 0 ? (
            <p className="text-sm font-medium">No slow movers — all stocked products have sold in the last 30 days.</p>
          ) : (
            <p className="text-sm font-medium">
              {slowMovers.length} product{slowMovers.length !== 1 ? 's' : ''} stocked but not selling
              {slowTotalCost > 0 && <> — <span className="font-bold">{formatCurrency(slowTotalCost)}</span> tied up in stock</>}
            </p>
          )}
        </div>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." className="input-admin pl-9" />
      </div>

      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">

        {/* ALL STOCK view */}
        {view === 'all' && (
          <table className="w-full min-w-[400px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Product</th>
                <th className="text-right text-xs font-medium text-gray-400 px-5 py-3">Stock</th>
                <th className="text-right text-xs font-medium text-gray-400 px-5 py-3 hidden sm:table-cell">Alert At</th>
                <th className="text-right text-xs font-medium text-gray-400 px-5 py-3 hidden sm:table-cell">Cost</th>
                <th className="text-right text-xs font-medium text-gray-400 px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400">No products found</td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="table-row">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-8 h-8 object-cover rounded-lg shrink-0" />
                      ) : (
                        <span className="text-xl">{p.icon || '📦'}</span>
                      )}
                      <span className="text-sm font-medium text-gray-900">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className={`badge font-semibold ${p.stock_quantity == null ? 'bg-gray-100 text-gray-500' : p.stock_quantity <= 0 ? 'bg-red-100 text-red-600' : p.stock_quantity <= p.low_stock_threshold ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
                      {p.stock_quantity ?? '∞'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-500 text-right hidden sm:table-cell">{p.low_stock_threshold}</td>
                  <td className="px-5 py-3 text-sm text-gray-500 text-right hidden sm:table-cell">{formatCurrency(p.cost_price)}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => setRestockProduct(p)} className="btn-secondary text-xs py-1.5 px-3">
                      <Plus className="w-3.5 h-3.5" /> Restock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* SLOW MOVERS view */}
        {view === 'slow' && (
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Product</th>
                <th className="text-right text-xs font-medium text-gray-400 px-5 py-3">Stock</th>
                <th className="text-right text-xs font-medium text-gray-400 px-5 py-3 hidden sm:table-cell">Last Sale</th>
                <th className="text-right text-xs font-medium text-gray-400 px-5 py-3 hidden sm:table-cell">Cost Value</th>
                <th className="text-right text-xs font-medium text-gray-400 px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {slowLoading ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400">Analyzing sales...</td></tr>
              ) : filteredSlow.length === 0 && slowLoaded ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400">No slow movers found</td></tr>
              ) : filteredSlow.map(p => (
                <tr key={p.id} className="table-row">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-8 h-8 object-cover rounded-lg shrink-0" />
                      ) : (
                        <span className="text-xl">{p.icon || '📦'}</span>
                      )}
                      <span className="text-sm font-medium text-gray-900">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="badge bg-amber-100 text-amber-700 font-semibold">
                      {p.stock_quantity}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right hidden sm:table-cell">
                    <span className={`text-sm font-medium ${
                      !p.last_sale_date ? 'text-red-500' : 'text-gray-500'
                    }`}>
                      {daysSince(p.last_sale_date)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-700 font-medium text-right hidden sm:table-cell">
                    {formatCurrency((p.stock_quantity ?? 0) * (p.cost_price ?? 0))}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => setRestockProduct(p)} className="btn-secondary text-xs py-1.5 px-3">
                      <Plus className="w-3.5 h-3.5" /> Restock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        </div>
      </div>

      {restockProduct && (
        <RestockModal
          product={restockProduct}
          suppliers={suppliers}
          onClose={() => setRestockProduct(null)}
          onSaved={() => { setRestockProduct(null); loadData() }}
        />
      )}
    </div>
  )
}

function RestockModal({ product, suppliers, onClose, onSaved }: {
  product: Product; suppliers: Supplier[]
  onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [qty, setQty] = useState(0)
  const [costPerUnit, setCostPerUnit] = useState(product.cost_price)
  const [supplierId, setSupplierId] = useState('')
  const [newSupplier, setNewSupplier] = useState('')
  const [notes, setNotes] = useState('')
  const [updatePrice, setUpdatePrice] = useState(false)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (qty <= 0) { toast.error('Enter a valid quantity'); return }
    setSaving(true)

    try {
      let finalSupplierId = supplierId
      if (newSupplier.trim()) {
        const { data, error: supErr } = await supabase
          .from('suppliers').insert({ name: newSupplier }).select().single()
        if (supErr) { toast.error(supErr.message); return }
        finalSupplierId = data?.id || ''
      }

      const { error: entryErr } = await supabase.from('stock_entries').insert({
        product_id: product.id,
        quantity_added: qty,
        cost_per_unit: costPerUnit,
        supplier_id: finalSupplierId || null,
        notes: notes || null,
      })
      if (entryErr) { toast.error(entryErr.message); return }

      const newStock = (product.stock_quantity ?? 0) + qty
      const updatePayload: any = { stock_quantity: newStock }
      if (updatePrice) updatePayload.cost_price = costPerUnit

      const { error: prodErr } = await supabase.from('products').update(updatePayload).eq('id', product.id)
      if (prodErr) { toast.error(prodErr.message); return }

      toast.success(`Restocked ${product.name} (+${qty})`)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md animate-scale-in max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 shrink-0">
          <h2 className="font-bold text-gray-900">Restock — {product.icon} {product.name}</h2>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 rounded-xl"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          <div className="p-3 bg-gray-50 rounded-xl flex justify-between">
            <span className="text-sm text-gray-600">Current stock</span>
            <span className="font-bold text-gray-900">{product.stock_quantity}</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity to add *</label>
            <input type="number" className="input-admin text-lg" value={qty || ''} onChange={e => setQty(parseInt(e.target.value) || 0)} min={1} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cost per unit</label>
              <input type="number" className="input-admin" value={costPerUnit} onChange={e => setCostPerUnit(parseFloat(e.target.value) || 0)} step={0.01} min={0} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
              <select className="input-admin" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                <option value="">Select...</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          {!supplierId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New supplier name</label>
              <input className="input-admin" value={newSupplier} onChange={e => setNewSupplier(e.target.value)} placeholder="Optional" />
            </div>
          )}
          <label className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer">
            <input type="checkbox" checked={updatePrice} onChange={e => setUpdatePrice(e.target.checked)} className="rounded" />
            <span className="text-sm text-amber-800">Update product cost price to {formatCurrency(costPerUnit)}</span>
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <input className="input-admin" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
          </div>
          {qty > 0 && (
            <div className="p-3 bg-emerald-50 rounded-xl flex justify-between">
              <span className="text-sm text-emerald-700">New stock level</span>
              <span className="font-bold text-emerald-700">{(product.stock_quantity ?? 0) + qty}</span>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Restock'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
