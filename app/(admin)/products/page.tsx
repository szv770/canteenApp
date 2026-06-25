'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, Edit2, X, ToggleLeft, ToggleRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { Product, Category } from '@/types/database'

const EMOJIS = ['🍕','🌮','🌯','🥗','🍔','🍟','🍦','🧁','🍰','🍩','🍪','🥤','☕','🧃','🍫','🍬','🍭','🧇','🥞','🌽','🍿','🧀','🥨','🫐','🍓','🍎','🍌','🍉','🍑','🍒']

export default function ProductsPage() {
  const supabase = createClient()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [pRes, cRes] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
    ])
    setProducts(pRes.data || [])
    setCategories(cRes.data || [])
    setLoading(false)
  }

  async function toggleActive(product: Product) {
    await supabase.from('products').update({ is_active: !product.is_active }).eq('id', product.id)
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, is_active: !p.is_active } : p))
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-500 text-sm mt-1">{products.filter(p => p.is_active).length} active products</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Add Product
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." className="input-admin pl-9" />
      </div>

      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[500px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Product</th>
              <th className="text-right text-xs font-medium text-gray-400 px-5 py-3">Price</th>
              <th className="text-right text-xs font-medium text-gray-400 px-3 sm:px-5 py-3 hidden sm:table-cell">Cost</th>
              <th className="text-right text-xs font-medium text-gray-400 px-5 py-3">Stock</th>
              <th className="text-center text-xs font-medium text-gray-400 px-5 py-3">Status</th>
              <th className="text-right text-xs font-medium text-gray-400 px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">Loading...</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id} className="table-row">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{p.icon || '📦'}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      {p.has_variants && <p className="text-xs text-gray-400">Has variants</p>}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(p.price)}</td>
                <td className="px-3 sm:px-5 py-3 text-sm text-gray-500 text-right hidden sm:table-cell">{formatCurrency(p.cost_price)}</td>
                <td className="px-5 py-3 text-right">
                  <span className={`badge ${p.stock_quantity <= 0 ? 'bg-red-100 text-red-600' : p.stock_quantity <= p.low_stock_threshold ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
                    {p.stock_quantity}
                  </span>
                </td>
                <td className="px-5 py-3 text-center">
                  <button onClick={() => toggleActive(p)}>
                    {p.is_active
                      ? <ToggleRight className="w-6 h-6 text-emerald-500" />
                      : <ToggleLeft className="w-6 h-6 text-gray-300" />
                    }
                  </button>
                </td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => setEditProduct(p)} className="p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-lg transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {(showAdd || editProduct) && (
        <ProductModal
          product={editProduct}
          categories={categories}
          onClose={() => { setShowAdd(false); setEditProduct(null) }}
          onSaved={() => { setShowAdd(false); setEditProduct(null); loadData() }}
        />
      )}
    </div>
  )
}

function ProductModal({ product, categories, onClose, onSaved }: {
  product: Product | null
  categories: Category[]
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [form, setForm] = useState({
    name: product?.name || '',
    price: product ? String(product.price) : '',
    cost_price: product ? String(product.cost_price ?? '') : '',
    stock_quantity: product ? String(product.stock_quantity ?? '') : '',
    low_stock_threshold: product?.low_stock_threshold || 5,
    icon: product?.icon || '',
    has_variants: product?.has_variants || false,
    show_when_out_of_stock: product?.show_when_out_of_stock ?? true,
    is_active: product?.is_active ?? true,
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.name.trim()) { toast.error('Name required'); return }
    const price = parseFloat(form.price)
    if (!form.price || isNaN(price) || price <= 0) { toast.error('Price is required'); return }
    const payload = {
      name: form.name,
      price,
      cost_price: form.cost_price !== '' ? parseFloat(form.cost_price) || 0 : 0,
      stock_quantity: form.stock_quantity !== '' ? parseInt(form.stock_quantity) || 0 : 0,
      low_stock_threshold: form.low_stock_threshold,
      icon: form.icon,
      has_variants: form.has_variants,
      show_when_out_of_stock: form.show_when_out_of_stock,
      is_active: form.is_active,
    }
    setSaving(true)
    const { error } = product
      ? await supabase.from('products').update(payload).eq('id', product.id)
      : await supabase.from('products').insert(payload)
    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success(product ? 'Product updated' : 'Product added')
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg animate-scale-in max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-bold text-gray-900 text-lg">{product ? 'Edit Product' : 'Add Product'}</h2>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 rounded-xl transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Emoji picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Icon</label>
            <div className="flex flex-wrap gap-1.5 p-3 bg-gray-50 rounded-xl max-h-28 overflow-y-auto">
              {EMOJIS.map(e => (
                <button key={e} onClick={() => setForm(f => ({ ...f, icon: e }))}
                  className={`w-8 h-8 text-xl flex items-center justify-center rounded-lg transition-all ${form.icon === e ? 'bg-brand-light ring-2 ring-brand' : 'hover:bg-gray-200'}`}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input className="input-admin" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price *</label>
              <input type="number" className="input-admin" placeholder="0.00" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} step={0.25} min={0} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cost Price</label>
              <input type="number" className="input-admin" placeholder="0.00" value={form.cost_price} onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))} step={0.25} min={0} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stock Qty</label>
              <input type="number" className="input-admin" placeholder="0" value={form.stock_quantity} onChange={e => setForm(f => ({ ...f, stock_quantity: e.target.value }))} min={0} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Low Stock Alert</label>
              <input type="number" className="input-admin" value={form.low_stock_threshold} onChange={e => setForm(f => ({ ...f, low_stock_threshold: parseInt(e.target.value) || 0 }))} min={0} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer">
              <input type="checkbox" checked={form.has_variants} onChange={e => setForm(f => ({ ...f, has_variants: e.target.checked }))} className="rounded" />
              <span className="text-sm text-gray-700">Has variants (sizes, flavors)</span>
            </label>
            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer">
              <input type="checkbox" checked={form.show_when_out_of_stock} onChange={e => setForm(f => ({ ...f, show_when_out_of_stock: e.target.checked }))} className="rounded" />
              <span className="text-sm text-gray-700">Show when out of stock</span>
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : product ? 'Save Changes' : 'Add Product'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
