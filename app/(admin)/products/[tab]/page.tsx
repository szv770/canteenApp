'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, Edit2, X, ToggleLeft, ToggleRight, Trash2, ChevronDown, ChevronUp, Check, Upload } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { Product, Category, ProductVariant, ProductAddon } from '@/types/database'
import TableSkeleton from '@/components/admin/TableSkeleton'
import BundlesPage from '../../bundles/page'
import InventoryPage from '../../inventory/page'
import DiscountCodesPage from '../../discount-codes/page'

const EMOJIS = ['🍕','🌮','🌯','🥗','🍔','🍟','🍦','🧡','🍰','🍩','🍪','🥤','☕','🧣','🍫','🍬','🍭','🧇','🥞','🌽','🍿','🧀','🥨','🪰','🍓','🍎','🍌','🍉','🍑','🍒']
const CAT_COLORS = ['#EF4444','#F97316','#F59E0B','#10B981','#06B6D4','#3B82F6','#8B5CF6','#EC4899','#6B7280','#1E293B']

type ProductTab = 'products' | 'bundles' | 'inventory' | 'discounts'

const PRODUCT_TABS: { key: ProductTab; label: string }[] = [
  { key: 'products', label: 'Products' },
  { key: 'bundles', label: 'Bundles' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'discounts', label: 'Discount Codes' },
]

export default function ProductsPage() {
  const params = useParams<{ tab: string }>()
  const VALID_TABS: ProductTab[] = ['products', 'bundles', 'inventory', 'discounts']
  const activeSection: ProductTab = VALID_TABS.includes(params.tab as ProductTab) ? (params.tab as ProductTab) : 'products'
  return (
    <div>
      <div className="flex gap-1 px-4 sm:px-6 pt-4 sm:pt-6 border-b border-slate-200">
        {PRODUCT_TABS.map(t => (
          <Link
            key={t.key}
            href={`/products/${t.key}`}
            className={`px-4 py-2.5 text-sm font-semibold -mb-px border-b-2 transition-colors ${
              activeSection === t.key
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {activeSection === 'products' && <ProductsContent />}
      {activeSection === 'bundles' && <BundlesPage />}
      {activeSection === 'inventory' && <InventoryPage />}
      {activeSection === 'discounts' && <DiscountCodesPage />}
    </div>
  )
}

function ProductsContent() {
  const supabase = createClient()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  // Map of product_id -> category_id[]
  const [productCategoryMap, setProductCategoryMap] = useState<Record<string, string[]>>({})
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<string>('') // '' = All
  const [loading, setLoading] = useState(true)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showCats, setShowCats] = useState(false)
  const [editCat, setEditCat] = useState<Category | null>(null)
  const [catForm, setCatForm] = useState({ name: '', color: CAT_COLORS[0] })
  const [savingCat, setSavingCat] = useState(false)

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

  // Helper: count how many products use a category
  function countProductsInCategory(catId: string): number {
    return Object.values(productCategoryMap).filter(ids => ids.includes(catId)).length
  }

  async function saveCategory() {
    if (!catForm.name.trim()) return
    setSavingCat(true)
    if (editCat) {
      await supabase.from('categories').update({ name: catForm.name.trim(), color: catForm.color }).eq('id', editCat.id)
    } else {
      await supabase.from('categories').insert({ name: catForm.name.trim(), color: catForm.color, sort_order: categories.length, is_active: true })
    }
    setSavingCat(false)
    setEditCat(null)
    setCatForm({ name: '', color: CAT_COLORS[0] })
    loadData()
  }

  async function deleteCategory(cat: Category) {
    const count = countProductsInCategory(cat.id)
    const countMsg = count > 0 ? ` ${count} product${count === 1 ? '' : 's'} use this category and will become uncategorized.` : ''
    if (!confirm(`Delete "${cat.name}"?${countMsg} This cannot be undone.`)) return
    const { error } = await supabase.from('categories').delete().eq('id', cat.id)
    if (error) { toast.error(error.message); return }
    // If we were filtering by this category, reset the filter
    if (catFilter === cat.id) setCatFilter('')
    toast.success('Category deleted')
    loadData()
  }

  function startEditCat(cat: Category) {
    setEditCat(cat)
    setCatForm({ name: cat.name, color: cat.color || CAT_COLORS[0] })
  }

  const filtered = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchesCat = catFilter === '' || (productCategoryMap[p.id] || []).includes(catFilter)
    return matchesSearch && matchesCat
  })

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

      {/* Categories inline panel */}
      <div className="admin-card mb-4 overflow-hidden">
        <button
          onClick={() => setShowCats(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <span>Categories <span className="text-slate-400 font-normal ml-1">({categories.length})</span></span>
          {showCats ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {showCats && (
          <div className="border-t border-slate-100 px-4 py-3 space-y-2">
            {categories.map(cat => (
              editCat?.id === cat.id ? (
                <div key={cat.id} className="flex items-center gap-2">
                  <input
                    className="input-admin text-sm flex-1"
                    value={catForm.name}
                    onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && saveCategory()}
                    onBlur={saveCategory}
                    autoFocus
                  />
                  <div className="flex gap-1">
                    {CAT_COLORS.map(c => (
                      <button key={c} onClick={() => setCatForm(f => ({ ...f, color: c }))}
                        className={`w-5 h-5 rounded-full border-2 transition-all ${catForm.color === c ? 'border-slate-700 scale-110' : 'border-transparent'}`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                  <button onClick={saveCategory} disabled={savingCat} className="p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => { setEditCat(null); setCatForm({ name: '', color: CAT_COLORS[0] }) }} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div key={cat.id} className="flex items-center gap-2 group">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: cat.color || '#6B7280' }} />
                  <span className="text-sm text-slate-700 flex-1">{cat.name}</span>
                  <span className="text-xs text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    {countProductsInCategory(cat.id)} products
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEditCat(cat)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteCategory(cat)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            ))}
            {/* Add new */}
            {!editCat && (
              <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                <input
                  className="input-admin text-sm flex-1"
                  placeholder="New category name..."
                  value={catForm.name}
                  onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && saveCategory()}
                />
                <div className="flex gap-1">
                  {CAT_COLORS.map(c => (
                    <button key={c} onClick={() => setCatForm(f => ({ ...f, color: c }))}
                      className={`w-5 h-5 rounded-full border-2 transition-all ${catForm.color === c ? 'border-slate-700 scale-110' : 'border-transparent'}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <button onClick={saveCategory} disabled={savingCat || !catForm.name.trim()} className="px-3 py-1.5 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-40 transition-colors">
                  Add
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Category filter pills */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setCatFilter('')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
              catFilter === ''
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCatFilter(catFilter === cat.id ? '' : cat.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                catFilter === cat.id
                  ? 'text-white border-transparent'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
              style={catFilter === cat.id ? { background: cat.color || '#6B7280', borderColor: cat.color || '#6B7280' } : {}}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

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
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="w-8 h-8 object-cover rounded-lg shrink-0" />
                    ) : (
                      <span className="text-xl">{p.icon || '📦'}</span>
                    )}
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
                      : <span className="text-xs text-slate-300">&mdash;</span>
                    }
                  </div>
                </td>
                <td className="px-5 py-3 text-sm font-semibold text-slate-900 text-right">{formatCurrency(p.price)}</td>
                <td className="px-3 sm:px-5 py-3 text-sm text-slate-500 text-right hidden sm:table-cell">{formatCurrency(p.cost_price)}</td>
                <td className="px-5 py-3 text-right">
                  {p.stock_quantity === null ? (
                    <span className="badge bg-slate-50 text-slate-400 border border-slate-100">&infin;</span>
                  ) : (
                    <span className={`badge ${p.stock_quantity <= 0 ? 'bg-red-50 text-red-600 border border-red-100' : p.stock_quantity <= p.low_stock_threshold ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                      {p.stock_quantity}
                    </span>
                  )}
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

function emptyVariant(defaultPrice = ''): VariantDraft {
  return { label: '', price: defaultPrice, stock_quantity: '', is_active: true }
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
    allow_preorder: product?.allow_preorder ?? false,
    preorder_source: product?.preorder_source || 'vendor',
    staff_price: product?.staff_price != null ? String(product.staff_price) : '',
    preorder_daily_cap: product?.preorder_daily_cap != null ? String(product.preorder_daily_cap) : '',
  })
  const [imageUrl, setImageUrl] = useState<string>(product?.image_url || '')
  const [imageUploading, setImageUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filename, file, { upsert: true })
      if (uploadError) {
        toast.error(`Upload failed: ${uploadError.message}`)
        return
      }
      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(filename)
      setImageUrl(urlData.publicUrl)
      toast.success('Image uploaded')
    } finally {
      setImageUploading(false)
      // reset input so same file can be re-selected if needed
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

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
      setVariants([emptyVariant(form.price)])
    }
  }

  function updateVariant(index: number, field: keyof VariantDraft, value: string | boolean) {
    setVariants(prev => prev.map((v, i) => i === index ? { ...v, [field]: value } : v))
  }

  function addVariant() {
    setVariants(prev => [...prev, emptyVariant(form.price)])
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
      }
    }

    setSaving(true)

    const salePrice = form.sale_active && form.sale_price !== '' ? parseFloat(form.sale_price) : null

    const payload = {
      name: form.name,
      price,
      cost_price: form.cost_price !== '' ? parseFloat(form.cost_price) || 0 : 0,
      stock_quantity: form.stock_quantity !== '' ? parseInt(form.stock_quantity) || 0 : null,
      low_stock_threshold: form.low_stock_threshold,
      icon: form.icon,
      image_url: imageUrl || null,
      has_variants: form.has_variants,
      show_when_out_of_stock: form.show_when_out_of_stock,
      is_active: form.is_active,
      sale_active: form.sale_active,
      sale_price: salePrice,
      sale_label: form.sale_label.trim() || null,
      sale_ends_at: form.sale_ends_at ? new Date(form.sale_ends_at).toISOString() : null,
      allow_preorder: form.allow_preorder,
      preorder_source: form.allow_preorder ? form.preorder_source : null,
      staff_price: form.allow_preorder && form.staff_price !== '' ? parseFloat(form.staff_price) : null,
      preorder_daily_cap: form.allow_preorder && form.preorder_daily_cap !== '' ? parseInt(form.preorder_daily_cap) || null : null,
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
          price: parseFloat(v.price) || price,
          stock_quantity: v.stock_quantity !== '' ? parseInt(v.stock_quantity) || 0 : null,
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

          {/* Product Image upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Product Image <span className="text-slate-400 font-normal">(optional — overrides emoji icon in POS)</span></label>
            <div className="flex items-center gap-3">
              {imageUrl ? (
                <img src={imageUrl} alt="Product" className="w-12 h-12 object-cover rounded-xl border border-slate-200 shrink-0" />
              ) : (
                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                  <span className="text-slate-300 text-xs text-center leading-tight">No img</span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={imageUploading}
                className="btn-secondary text-sm flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                {imageUploading ? 'Uploading...' : imageUrl ? 'Replace' : 'Upload Image'}
              </button>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  className="text-sm text-red-500 hover:text-red-600 font-medium"
                >
                  Remove
                </button>
              )}
            </div>
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
              <p className="text-xs text-slate-400 mt-1">Used for &ldquo;At cost&rdquo; account type discounts</p>
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

          {/* Preorders */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allow_preorder}
                onChange={e => setForm(f => ({ ...f, allow_preorder: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm font-medium text-slate-700">Orderable via Preorders</span>
            </label>
            <p className="text-xs text-slate-400 -mt-2">Shows on the Preorders POS screen and public ordering link instead of the regular POS grid.</p>
            {form.allow_preorder && (
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Source</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setForm(f => ({ ...f, preorder_source: 'vendor' }))}
                      className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${form.preorder_source === 'vendor' ? 'bg-amber-400 text-white border-amber-400' : 'bg-white text-slate-600 border-slate-200'}`}>
                      3rd-Party Vendor
                    </button>
                    <button type="button" onClick={() => setForm(f => ({ ...f, preorder_source: 'in_house' }))}
                      className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${form.preorder_source === 'in_house' ? 'bg-amber-400 text-white border-amber-400' : 'bg-white text-slate-600 border-slate-200'}`}>
                      In-House (I make it)
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {form.preorder_source === 'vendor'
                      ? 'Counts toward what you owe the vendor and shows on the "Send to Vendor" list.'
                      : 'Shows on the "To prepare" list instead — no vendor cost tracking.'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Staff Price <span className="text-slate-400 font-normal">(optional override, can be $0)</span></label>
                  <input type="number" className="input-admin" placeholder="Leave blank to use the account type's normal discount" value={form.staff_price} onChange={e => setForm(f => ({ ...f, staff_price: e.target.value }))} step={0.25} min={0} />
                  <p className="text-xs text-slate-400 mt-1">Applies only to bochurim whose account type is flagged "Staff pricing" (Students → Account Types). Never shown side-by-side with the camper price.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Daily Cap <span className="text-slate-400 font-normal">(optional, blank = unlimited)</span></label>
                  <input type="number" className="input-admin" placeholder="e.g. 50" value={form.preorder_daily_cap} onChange={e => setForm(f => ({ ...f, preorder_daily_cap: e.target.value }))} min={1} />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Stock Qty <span className="text-slate-400 font-normal">(blank = unlimited)</span></label>
              <input type="number" className="input-admin" placeholder="∞ unlimited" value={form.stock_quantity} onChange={e => setForm(f => ({ ...f, stock_quantity: e.target.value }))} min={0} />
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
                            placeholder={form.price || '0.00'}
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
