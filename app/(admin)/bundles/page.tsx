'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, Edit2, X, ToggleLeft, ToggleRight, Trash2, Minus } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { Product, ProductBundle, BundleItem, ProductBundleWithItems } from '@/types/database'
import TableSkeleton from '@/components/admin/TableSkeleton'

const EMOJIS = ['🍕','🌮','🌯','🥗','🍔','🍟','🍦','🧁','🍰','🍩','🍪','🥤','☕','🧃','🍫','🍬','🍭','🧇','🥞','🌽','🍿','🧀','🥨','🫐','🍓','🍎','🍌','🍉','🍑','🍒','🎁','⭐','🔥','💎','🎯']

export default function BundlesPage() {
  const supabase = createClient()
  const [bundles, setBundles] = useState<ProductBundleWithItems[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [editBundle, setEditBundle] = useState<ProductBundleWithItems | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data } = await supabase
      .from('product_bundles')
      .select('*, bundle_items(*, products(name, icon))')
      .order('sort_order')
      .order('name')
    setBundles((data as ProductBundleWithItems[]) || [])
    setLoading(false)
  }

  async function toggleActive(bundle: ProductBundleWithItems) {
    await supabase.from('product_bundles').update({ is_active: !bundle.is_active }).eq('id', bundle.id)
    setBundles(prev => prev.map(b => b.id === bundle.id ? { ...b, is_active: !b.is_active } : b))
  }

  async function deleteBundle(bundle: ProductBundleWithItems) {
    const confirmed = window.confirm(`Delete "${bundle.name}"? This cannot be undone.`)
    if (!confirmed) return
    const { error } = await supabase.from('product_bundles').delete().eq('id', bundle.id)
    if (error) { toast.error(error.message); return }
    toast.success(`"${bundle.name}" deleted`)
    setBundles(prev => prev.filter(b => b.id !== bundle.id))
  }

  const filtered = bundles.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Bundles &amp; Deals</h1>
          <p className="text-slate-500 text-sm mt-1">{bundles.filter(b => b.is_active).length} active bundles</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Add Bundle
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search bundles..." className="input-admin pl-9" />
      </div>

      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Bundle</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Items</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Price</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Savings</th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Status</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={6} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-400 text-sm">
                    {search ? 'No bundles match your search.' : 'No bundles yet. Create your first bundle deal!'}
                  </td>
                </tr>
              ) : filtered.map(b => {
                const savings = b.original_price != null ? b.original_price - b.price : null
                return (
                  <tr key={b.id} className="table-row">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{b.icon || '🎁'}</span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{b.name}</p>
                          {b.description && <p className="text-xs text-slate-400 truncate max-w-[200px]">{b.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {b.bundle_items.length === 0
                          ? <span className="text-xs text-slate-300">No items</span>
                          : b.bundle_items.map(item => (
                            <span key={item.id} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                              {item.quantity > 1 && <span className="mr-0.5">{item.quantity}x</span>}
                              {item.products?.icon && <span className="mr-0.5">{item.products.icon}</span>}
                              {item.products?.name || 'Unknown'}
                            </span>
                          ))
                        }
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <p className="text-sm font-semibold text-amber-600">{formatCurrency(b.price)}</p>
                      {b.original_price != null && (
                        <p className="text-xs text-slate-400 line-through">{formatCurrency(b.original_price)}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {savings != null && savings > 0
                        ? <span className="badge bg-emerald-50 text-emerald-600 border border-emerald-100">Save {formatCurrency(savings)}</span>
                        : <span className="text-xs text-slate-300">—</span>
                      }
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => toggleActive(b)}>
                        {b.is_active
                          ? <ToggleRight className="w-6 h-6 text-emerald-500" />
                          : <ToggleLeft className="w-6 h-6 text-slate-300" />
                        }
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditBundle(b)} className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-lg transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteBundle(b)} className="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {(showAdd || editBundle) && (
        <BundleModal
          bundle={editBundle}
          onClose={() => { setShowAdd(false); setEditBundle(null) }}
          onSaved={() => { setShowAdd(false); setEditBundle(null); loadData() }}
        />
      )}
    </div>
  )
}

type BundleItemDraft = {
  product_id: string
  product_name: string
  product_icon: string | null
  quantity: number
}

function BundleModal({ bundle, onClose, onSaved }: {
  bundle: ProductBundleWithItems | null
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [form, setForm] = useState({
    name: bundle?.name || '',
    description: bundle?.description || '',
    price: bundle ? String(bundle.price) : '',
    original_price: bundle?.original_price != null ? String(bundle.original_price) : '',
    icon: bundle?.icon || '',
    is_active: bundle?.is_active ?? true,
    sort_order: bundle?.sort_order ?? 0,
  })
  const [bundleItems, setBundleItems] = useState<BundleItemDraft[]>(
    bundle?.bundle_items.map(bi => ({
      product_id: bi.product_id,
      product_name: bi.products?.name || 'Unknown',
      product_icon: bi.products?.icon || null,
      quantity: bi.quantity,
    })) || []
  )
  const [products, setProducts] = useState<Pick<Product, 'id' | 'name' | 'icon' | 'price'>[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('products')
      .select('id, name, icon, price, is_active')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setProducts(data || []))
  }, [])

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) &&
    !bundleItems.find(bi => bi.product_id === p.id)
  )

  function addProduct(p: Pick<Product, 'id' | 'name' | 'icon' | 'price'>) {
    setBundleItems(prev => [...prev, {
      product_id: p.id,
      product_name: p.name,
      product_icon: p.icon,
      quantity: 1,
    }])
    setProductSearch('')
  }

  function removeItem(productId: string) {
    setBundleItems(prev => prev.filter(bi => bi.product_id !== productId))
  }

  function updateQty(productId: string, qty: number) {
    if (qty < 1) return
    setBundleItems(prev => prev.map(bi => bi.product_id === productId ? { ...bi, quantity: qty } : bi))
  }

  async function save() {
    if (!form.name.trim()) { toast.error('Name required'); return }
    const price = parseFloat(form.price)
    if (!form.price || isNaN(price) || price < 0) { toast.error('Bundle price is required'); return }

    setSaving(true)

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price,
      original_price: form.original_price !== '' ? parseFloat(form.original_price) || null : null,
      icon: form.icon || null,
      is_active: form.is_active,
      sort_order: form.sort_order,
    }

    let bundleId: string
    if (bundle) {
      const { error } = await supabase.from('product_bundles').update(payload).eq('id', bundle.id)
      if (error) { toast.error(error.message); setSaving(false); return }
      bundleId = bundle.id
    } else {
      const { data, error } = await supabase.from('product_bundles').insert(payload).select('id').single()
      if (error || !data) { toast.error(error?.message || 'Failed to create bundle'); setSaving(false); return }
      bundleId = data.id
    }

    // Replace bundle items: delete all then insert
    const { error: delErr } = await supabase.from('bundle_items').delete().eq('bundle_id', bundleId)
    if (delErr) { toast.error(delErr.message); setSaving(false); return }

    if (bundleItems.length > 0) {
      const rows = bundleItems.map(bi => ({
        bundle_id: bundleId,
        product_id: bi.product_id,
        quantity: bi.quantity,
      }))
      const { error: insErr } = await supabase.from('bundle_items').insert(rows)
      if (insErr) { toast.error(insErr.message); setSaving(false); return }
    }

    toast.success(bundle ? 'Bundle updated' : 'Bundle created')
    onSaved()
  }

  const savings = form.original_price !== '' && form.price !== ''
    ? (parseFloat(form.original_price) || 0) - (parseFloat(form.price) || 0)
    : null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg animate-scale-in max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="font-bold text-slate-900 text-lg">{bundle ? 'Edit Bundle' : 'Add Bundle'}</h2>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Icon picker */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Icon <span className="text-slate-400 font-normal">(optional)</span></label>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center text-2xl shrink-0">
                {form.icon || <span className="text-slate-300 text-sm">None</span>}
              </div>
              <input
                type="text"
                className="input-admin flex-1"
                placeholder="Paste or type any emoji, e.g. 🎁"
                value={form.icon}
                onChange={e => setForm(f => ({ ...f, icon: e.target.value.trim() }))}
                maxLength={8}
              />
              {form.icon && (
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, icon: '' }))}
                  className="px-3 py-2 text-sm text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-slate-200"
                >
                  Clear
                </button>
              )}
            </div>
            <details className="group">
              <summary className="text-xs text-amber-600 cursor-pointer hover:underline list-none">Show quick-pick emojis</summary>
              <div className="flex flex-wrap gap-1.5 p-3 bg-slate-50 rounded-xl max-h-28 overflow-y-auto mt-2">
                {EMOJIS.map(e => (
                  <button key={e} type="button" onClick={() => setForm(f => ({ ...f, icon: e }))}
                    className={`w-8 h-8 text-xl flex items-center justify-center rounded-lg transition-all ${form.icon === e ? 'bg-amber-100 ring-2 ring-amber-400' : 'hover:bg-slate-200'}`}>
                    {e}
                  </button>
                ))}
              </div>
            </details>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
            <input autoFocus className="input-admin" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Lunch Combo" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description <span className="text-slate-400 font-normal">(optional)</span></label>
            <input className="input-admin" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Sandwich + drink + snack" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Bundle Price *</label>
              <input type="number" className="input-admin" placeholder="0.00" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} step={0.25} min={0} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Original Price <span className="text-slate-400 font-normal">(optional)</span></label>
              <input type="number" className="input-admin" placeholder="0.00" value={form.original_price} onChange={e => setForm(f => ({ ...f, original_price: e.target.value }))} step={0.25} min={0} />
            </div>
          </div>

          {savings != null && savings > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-xl border border-emerald-100">
              <span className="text-emerald-600 text-sm font-medium">Customers save {formatCurrency(savings)} with this deal!</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Sort Order</label>
              <input type="number" className="input-admin" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} min={0} />
            </div>
          </div>

          <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
              className="rounded"
            />
            <span className="text-sm text-slate-700">Active (visible in POS)</span>
          </label>

          {/* Bundle Items */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-slate-700">Bundle Items</p>

            {bundleItems.length > 0 && (
              <div className="space-y-2">
                {bundleItems.map(bi => (
                  <div key={bi.product_id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl">
                    <span className="text-lg shrink-0">{bi.product_icon || '📦'}</span>
                    <span className="flex-1 text-sm font-medium text-slate-800 truncate">{bi.product_name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateQty(bi.product_id, bi.quantity - 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
                      >
                        <Minus className="w-3 h-3 text-slate-600" />
                      </button>
                      <span className="w-6 text-center text-sm font-bold text-slate-800">{bi.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQty(bi.product_id, bi.quantity + 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
                      >
                        <Plus className="w-3 h-3 text-slate-600" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(bi.product_id)}
                      className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Product search */}
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  className="input-admin pl-9 text-sm"
                  placeholder="Search products to add..."
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                />
              </div>
              {productSearch && filteredProducts.length > 0 && (
                <div className="mt-1 border border-slate-200 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                  {filteredProducts.slice(0, 8).map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProduct(p)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-amber-50 transition-colors text-left border-b border-slate-100 last:border-0"
                    >
                      <span className="text-base">{p.icon || '📦'}</span>
                      <span className="flex-1 text-sm text-slate-800">{p.name}</span>
                      <span className="text-xs text-slate-400">{formatCurrency(p.price)}</span>
                      <Plus className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
              {productSearch && filteredProducts.length === 0 && (
                <p className="mt-1 text-xs text-slate-400 px-1">No products found.</p>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : bundle ? 'Save Changes' : 'Create Bundle'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
