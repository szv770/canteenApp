'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, Edit2, X, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { Product, Category, ProductVariant, ProductAddon } from '@/types/database'
import TableSkeleton from '@/components/admin/TableSkeleton'

const EMOJIS = ['🍕','🌮','🌯','🥗','🍔','🍟','🍦','🧁','🍰','🍩','🍪','🥤','☕','🧃','🍫','🍬','🍭','🧇','🥞','🌽','🍿','🧀','🥨','🫐','🍓','🍎','🍌','🍉','🍑','🍒']

export default function ProductsPage() {
  const supabase = createClient()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  // Map of product_id -> category_id[]
  const [productCategoryMap, setProductCategoryMap] = useState<Record<string, string[]>>({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [pRes, cRes, pcRes] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('product_categories').select('product_id,category_id'),
    ])
    setProducts(pRes.data || [])
    setCategories(cRes.data || [])

    // Build product -> category[] map
    const pcMap: Record<string, string[]> = {}
    if (pcRes.data) {
      pcRes.data.forEach((row: any) => {
        if (!pcMap[row.product_id]) pcMap[row.product_id] = []
        pcMap[row.product_id].push(row.category_id)
      })
    }
    setProductCategoryMap(pcMap)
    setLoading(false)
  }

  async function toggleActive(product: Product) {
    await supabase.from('products').update({ is_active: !product.is_active }).eq('id', product.id)
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, is_active: !p.is_active } : p))
  }

  async function deleteProduct(product: Product) {
    const confirmed = window.confirm(`Delete "${product.name}"? This cannot be undone.`)
    if (!confirmed) return
    const { error } = await supabase.from('products').delete().eq('id', product.id)
    if (error) { toast.error(error.message); return }
    toast.success(`"${product.name}" deleted`)
    setProducts(prev => prev.filter(p => p.id !== product.id))
    setProductCategoryMap(prev => {
      const next = { ...prev }
      delete next[product.id]
      return next
    })
  }

  // Helper: get category names for a product
  function getCategoryNames(productId: string): string[] {
    const ids = productCategoryMap[productId] || []
    return ids
      .map(id => categories.find(c => c.id === id)?.name)
      .filter((n): n is string => Boolean(n))
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Products</h1>
          <p className="text-slate-500 text-sm mt-1">{products.filter(p => p.is_active).length} active products</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Add Product
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." className="input-admin pl-9" />
      </div>

      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[500px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Product</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Categories</th>
              <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Price</th>
              <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 sm:px-5 py-3 hidden sm:table-cell">Cost</th>
              <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Stock</th>
              <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Status</th>
              <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton cols={7} />
            ) : filtered.map(p => (
              <tr key={p.id} className="table-row">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{p.icon || '📦'}</span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                        {p.sale_active && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white leading-none">
                            SALE
                          </span>
                        )}
                      </div>
                      {p.has_variants && <p className="text-xs text-slate-400">Has variants</p>}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {getCategoryNames(p.id).length > 0
                      ? getCategoryNames(p.id).map(name => (
                          <span key={name} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                            {name}
                          </span>
                        ))
                      : <span className="text-xs text-slate-300">—</span>
                    }
                  </div>
                </td>
                <td className="px-5 py-3 text-sm font-semibold text-slate-900 text-right">{formatCurrency(p.price)}</td>
                <td className="px-3 sm:px-5 py-3 text-sm text-slate-500 text-right hidden sm:table-cell">{formatCurrency(p.cost_price)}</td>
                <td className="px-5 py-3 text-right">
                  <span className={`badge ${p.stock_quantity <= 0 ? 'bg-red-50 text-red-600 border border-red-100' : p.stock_quantity <= p.low_stock_threshold ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                    {p.stock_quantity}
                  </span>
                </td>
                <td className="px-5 py-3 text-center">
                  <button onClick={() => toggleActive(p)}>
                    {p.is_active
                      ? <ToggleRight className="w-6 h-6 text-emerald-500" />
                      : <ToggleLeft className="w-6 h-6 text-slate-300" />
                    }
                  </button>
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setEditProduct(p)} className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteProduct(p)} className="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
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
          initialCategoryIds={editProduct ? (productCategoryMap[editProduct.id] || []) : []}
          onClose={() => { setShowAdd(false); setEditProduct(null) }}
          onSaved={() => { setShowAdd(false); setEditProduct(null); loadData() }}
        />
      )}
    </div>
  )
}

// A local type for variant rows being edited in the modal (no id until saved)
type VariantDraft = {
  id?: string          // present when loaded from DB; absent for newly added rows
  label: string
  price: string        // kept as string for controlled input
  stock_quantity: string
  is_active: boolean
}

function emptyVariant(): VariantDraft {
  return { label: '', price: '', stock_quantity: '', is_active: true }
}

// A local type for addon rows being edited in the modal
type AddonDraft = {
  id?: string
  name: string
  price_addition: string  // kept as string for controlled input
  is_active: boolean
}

function emptyAddon(): AddonDraft {
  return { name: '', price_addition: '', is_active: true }
}

function ProductModal({ product, categories, initialCategoryIds, onClose, onSaved }: {
  product: Product | null
  categories: Category[]
  initialCategoryIds: string[]
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
    sale_active: product?.sale_active ?? false,
    sale_price: product?.sale_price != null ? String(product.sale_price) : '',
    sale_label: product?.sale_label || '',
    sale_ends_at: product?.sale_ends_at ? product.sale_ends_at.slice(0, 16) : '',
  })
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(initialCategoryIds)
  const [variants, setVariants] = useState<VariantDraft[]>([])
  const [variantsLoading, setVariantsLoading] = useState(false)
  const [hasAddons, setHasAddons] = useState(false)
  const [addons, setAddons] = useState<AddonDraft[]>([])
  const [addonsLoading, setAddonsLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  function toggleCategory(id: string) {
    setSelectedCategoryIds(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  // Load existing variants when editing a product that has_variants
  useEffect(() => {
    if (product?.id && product.has_variants) {
      setVariantsLoading(true)
      supabase
        .from('product_variants')
        .select('*')
        .eq('product_id', product.id)
        .order('sort_order')
        .then(({ data }) => {
          if (data && data.length > 0) {
            setVariants(data.map((v: ProductVariant) => ({
              id: v.id,
              label: v.label,
              price: String(v.price),
              stock_quantity: String(v.stock_quantity),
              is_active: v.is_active,
            })))
          } else {
            setVariants([emptyVariant()])
          }
          setVariantsLoading(false)
        })
    }
  }, [])

  // Load existing add-ons when editing a product
  useEffect(() => {
    if (product?.id) {
      setAddonsLoading(true)
      supabase
        .from('product_addons')
        .select('*')
        .eq('product_id', product.id)
        .order('sort_order')
        .then(({ data }) => {
          if (data && data.length > 0) {
            setHasAddons(true)
            setAddons(data.map((a: ProductAddon) => ({
              id: a.id,
              name: a.name,
              price_addition: String(a.price_addition),
              is_active: a.is_active,
            })))
          }
          setAddonsLoading(false)
        })
    }
  }, [])

  function handleHasAddonsChange(checked: boolean) {
    setHasAddons(checked)
    if (checked && addons.length === 0) {
      setAddons([emptyAddon()])
    }
  }

  function updateAddon(index: number, field: keyof AddonDraft, value: string | boolean) {
    setAddons(prev => prev.map((a, i) => i === index ? { ...a, [field]: value } : a))
  }

  function addAddon() {
    setAddons(prev => [...prev, emptyAddon()])
  }

  function removeAddon(index: number) {
    setAddons(prev => prev.filter((_, i) => i !== index))
  }

  // When has_variants is toggled on and there are no rows yet, seed one empty row
  function handleHasVariantsChange(checked: boolean) {
    setForm(f => ({ ...f, has_variants: checked }))
    if (checked && variants.length === 0) {
      setVariants([emptyVariant()])
    }
  }

  function updateVariant(index: number, field: keyof VariantDraft, value: string | boolean) {
    setVariants(prev => prev.map((v, i) => i === index ? { ...v, [field]: value } : v))
  }

  function addVariant() {
    setVariants(prev => [...prev, emptyVariant()])
  }

  function removeVariant(index: number) {
    setVariants(prev => prev.filter((_, i) => i !== index))
  }

  async function save() {
    if (!form.name.trim()) { toast.error('Name required'); return }
    const price = parseFloat(form.price)
    if (!form.price || isNaN(price) || price <= 0) { toast.error('Price is required'); return }

    // Validate variants if enabled
    if (form.has_variants) {
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i]
        if (!v.label.trim()) { toast.error(`Variant ${i + 1}: label is required`); return }
        const vp = parseFloat(v.price)
        if (!v.price || isNaN(vp) || vp <= 0) { toast.error(`Variant ${i + 1}: valid price is required`); return }
      }
    }

    setSaving(true)

    const salePrice = form.sale_active && form.sale_price !== '' ? parseFloat(form.sale_price) : null

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
      sale_active: form.sale_active,
      sale_price: salePrice,
      sale_label: form.sale_label.trim() || null,
      sale_ends_at: form.sale_ends_at ? new Date(form.sale_ends_at).toISOString() : null,
    }

    let productId: string
    if (product) {
      const { error } = await supabase.from('products').update(payload).eq('id', product.id)
      if (error) { toast.error(error.message); setSaving(false); return }
      productId = product.id
    } else {
      const { data, error } = await supabase.from('products').insert(payload).select('id').single()
      if (error || !data) { toast.error(error?.message || 'Failed to create product'); setSaving(false); return }
      productId = data.id
    }

    // Sync product_categories: delete existing then insert selected
    const { error: delCatError } = await supabase
      .from('product_categories')
      .delete()
      .eq('product_id', productId)
    if (delCatError) { toast.error(delCatError.message); setSaving(false); return }

    if (selectedCategoryIds.length > 0) {
      const rows = selectedCategoryIds.map(category_id => ({ product_id: productId, category_id }))
      const { error: insCatError } = await supabase.from('product_categories').insert(rows)
      if (insCatError) { toast.error(insCatError.message); setSaving(false); return }
    }

    // Handle variants: delete all existing then insert the current list
    if (form.has_variants) {
      const { error: delVarError } = await supabase
        .from('product_variants')
        .delete()
        .eq('product_id', productId)
      if (delVarError) { toast.error(delVarError.message); setSaving(false); return }

      if (variants.length > 0) {
        const varRows = variants.map((v, i) => ({
          product_id: productId,
          label: v.label.trim(),
          price: parseFloat(v.price) || 0,
          stock_quantity: parseInt(v.stock_quantity) || 0,
          is_active: v.is_active,
          sort_order: i,
        }))
        const { error: insVarError } = await supabase.from('product_variants').insert(varRows)
        if (insVarError) { toast.error(insVarError.message); setSaving(false); return }
      }
    } else {
      // If has_variants was turned off, remove all variants
      await supabase.from('product_variants').delete().eq('product_id', productId)
    }

    // Handle add-ons: delete all existing then insert current list
    const { error: delAddonError } = await supabase
      .from('product_addons')
      .delete()
      .eq('product_id', productId)
    if (delAddonError) { toast.error(delAddonError.message); setSaving(false); return }

    if (hasAddons && addons.length > 0) {
      const addonRows = addons.map((a, i) => ({
        product_id: productId,
        name: a.name.trim(),
        price_addition: parseFloat(a.price_addition) || 0,
        is_active: a.is_active,
        sort_order: i,
      }))
      const { error: insAddonError } = await supabase.from('product_addons').insert(addonRows)
      if (insAddonError) { toast.error(insAddonError.message); setSaving(false); return }
    }

    toast.success(product ? 'Product updated' : 'Product added')
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg animate-scale-in max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="font-bold text-slate-900 text-lg">{product ? 'Edit Product' : 'Add Product'}</h2>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors"><X className="w-5 h-5 text-slate-400" /></button>
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
                placeholder="Paste or type any emoji, e.g. 🍕"
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
            <input autoFocus className="input-admin" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Price *</label>
              <input type="number" className="input-admin" placeholder="0.00" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} step={0.25} min={0} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cost Price</label>
              <input type="number" className="input-admin" placeholder="0.00" value={form.cost_price} onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))} step={0.25} min={0} />
            </div>
          </div>

          {/* Sale / Promotion */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.sale_active}
                onChange={e => setForm(f => ({ ...f, sale_active: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm font-medium text-slate-700">On Sale</span>
            </label>
            {form.sale_active && (
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Sale Price *</label>
                  <input
                    type="number"
                    className="input-admin"
                    placeholder="0.00"
                    value={form.sale_price}
                    onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))}
                    step={0.25}
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Sale Label <span className="text-slate-400 font-normal">(optional, e.g. "20% off")</span></label>
                  <input
                    type="text"
                    className="input-admin"
                    placeholder="e.g. Weekend Special"
                    value={form.sale_label}
                    onChange={e => setForm(f => ({ ...f, sale_label: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Sale Ends <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input
                    type="datetime-local"
                    className="input-admin"
                    value={form.sale_ends_at}
                    onChange={e => setForm(f => ({ ...f, sale_ends_at: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Stock Qty</label>
              <input type="number" className="input-admin" placeholder="0" value={form.stock_quantity} onChange={e => setForm(f => ({ ...f, stock_quantity: e.target.value }))} min={0} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Low Stock Alert</label>
              <input type="number" className="input-admin" value={form.low_stock_threshold} onChange={e => setForm(f => ({ ...f, low_stock_threshold: parseInt(e.target.value) || 0 }))} min={0} />
            </div>
          </div>

          {/* Categories */}
          {categories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Categories</label>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => {
                  const selected = selectedCategoryIds.includes(cat.id)
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggleCategory(cat.id)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                        selected
                          ? 'bg-amber-400 text-white border-amber-400'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300'
                      }`}
                    >
                      {cat.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={form.has_variants}
                onChange={e => handleHasVariantsChange(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-slate-700">Has variants (sizes, flavors)</span>
            </label>
            <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={hasAddons}
                onChange={e => handleHasAddonsChange(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-slate-700">Has add-ons (toppings, extras)</span>
            </label>
            <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
              <input type="checkbox" checked={form.show_when_out_of_stock} onChange={e => setForm(f => ({ ...f, show_when_out_of_stock: e.target.checked }))} className="rounded" />
              <span className="text-sm text-slate-700">Show when out of stock</span>
            </label>
          </div>

          {/* Variant management — only shown when has_variants is checked */}
          {form.has_variants && (
            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-slate-700">Variants</p>

              {variantsLoading ? (
                <p className="text-sm text-slate-400">Loading variants...</p>
              ) : (
                <>
                  {variants.length > 0 && (
                    <div className="space-y-2">
                      {/* Column headers */}
                      <div className="grid grid-cols-[1fr_80px_72px_32px_32px] gap-2 px-1">
                        <p className="text-xs font-medium text-slate-400">Label</p>
                        <p className="text-xs font-medium text-slate-400">Price</p>
                        <p className="text-xs font-medium text-slate-400">Stock</p>
                        <p className="text-xs font-medium text-slate-400 text-center">On</p>
                        <span />
                      </div>

                      {variants.map((v, i) => (
                        <div key={i} className="grid grid-cols-[1fr_80px_72px_32px_32px] gap-2 items-center">
                          <input
                            className="input-admin text-sm"
                            placeholder="e.g. Small"
                            value={v.label}
                            onChange={e => updateVariant(i, 'label', e.target.value)}
                          />
                          <input
                            type="number"
                            className="input-admin text-sm"
                            placeholder="0.00"
                            step={0.25}
                            min={0}
                            value={v.price}
                            onChange={e => updateVariant(i, 'price', e.target.value)}
                          />
                          <input
                            type="number"
                            className="input-admin text-sm"
                            placeholder="0"
                            min={0}
                            value={v.stock_quantity}
                            onChange={e => updateVariant(i, 'stock_quantity', e.target.value)}
                          />
                          <div className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={v.is_active}
                              onChange={e => updateVariant(i, 'is_active', e.target.checked)}
                              className="rounded"
                            />
                          </div>
                          <button
                            onClick={() => removeVariant(i)}
                            className="flex items-center justify-center w-8 h-8 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={addVariant}
                    className="flex items-center gap-1.5 text-sm text-amber-600 font-medium hover:underline"
                  >
                    <Plus className="w-4 h-4" /> Add variant
                  </button>
                </>
              )}
            </div>
          )}

          {/* Add-on management — only shown when hasAddons is checked */}
          {hasAddons && (
            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-slate-700">Add-ons</p>

              {addonsLoading ? (
                <p className="text-sm text-slate-400">Loading add-ons...</p>
              ) : (
                <>
                  {addons.length > 0 && (
                    <div className="space-y-2">
                      {/* Column headers */}
                      <div className="grid grid-cols-[1fr_90px_32px_32px] gap-2 px-1">
                        <p className="text-xs font-medium text-slate-400">Name</p>
                        <p className="text-xs font-medium text-slate-400">+Price</p>
                        <p className="text-xs font-medium text-slate-400 text-center">On</p>
                        <span />
                      </div>

                      {addons.map((a, i) => (
                        <div key={i} className="grid grid-cols-[1fr_90px_32px_32px] gap-2 items-center">
                          <input
                            className="input-admin text-sm"
                            placeholder="e.g. Extra cheese"
                            value={a.name}
                            onChange={e => updateAddon(i, 'name', e.target.value)}
                          />
                          <input
                            type="number"
                            className="input-admin text-sm"
                            placeholder="0.00"
                            step={0.25}
                            min={0}
                            value={a.price_addition}
                            onChange={e => updateAddon(i, 'price_addition', e.target.value)}
                          />
                          <div className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={a.is_active}
                              onChange={e => updateAddon(i, 'is_active', e.target.checked)}
                              className="rounded"
                            />
                          </div>
                          <button
                            onClick={() => removeAddon(i)}
                            className="flex items-center justify-center w-8 h-8 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={addAddon}
                    className="flex items-center gap-1.5 text-sm text-amber-600 font-medium hover:underline"
                  >
                    <Plus className="w-4 h-4" /> Add add-on
                  </button>
                </>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : product ? 'Save Changes' : 'Add Product'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
