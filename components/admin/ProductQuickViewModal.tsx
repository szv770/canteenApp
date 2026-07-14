'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { X, Package, Tag } from 'lucide-react'

interface Props {
  productId: string
  onClose: () => void
}

interface VariantRow {
  id: string
  label: string
  price: number
  cost_price: number | null
  stock_quantity: number | null
  is_active: boolean
}

interface AddonRow {
  id: string
  name: string
  price_addition: number
  is_active: boolean
}

interface ProductRow {
  id: string
  name: string
  price: number
  cost_price: number
  stock_quantity: number | null
  icon: string | null
  image_url: string | null
  has_variants: boolean
  is_active: boolean
  sale_price: number | null
  sale_active: boolean
  sale_label: string | null
}

export default function ProductQuickViewModal({ productId, onClose }: Props) {
  const supabase = createClient()
  const [product, setProduct] = useState<ProductRow | null>(null)
  const [variants, setVariants] = useState<VariantRow[]>([])
  const [addons, setAddons] = useState<AddonRow[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [unitsSold30d, setUnitsSold30d] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    async function load() {
      const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const [{ data: p }, { data: v }, { data: a }, { data: pc }, { data: items }] = await Promise.all([
        supabase.from('products').select('*').eq('id', productId).single(),
        supabase.from('product_variants').select('*').eq('product_id', productId).order('sort_order'),
        supabase.from('product_addons').select('*').eq('product_id', productId).order('sort_order'),
        supabase.from('product_categories').select('categories(name)').eq('product_id', productId),
        supabase.from('order_items')
          .select('quantity, orders!inner(created_at, status)')
          .eq('product_id', productId).eq('is_bundle_component', false)
          .eq('orders.status', 'completed')
          .gte('orders.created_at', thirtyDaysAgo.toISOString()),
      ])
      if (cancelled) return
      setProduct(p as ProductRow)
      setVariants((v || []) as VariantRow[])
      setAddons((a || []) as AddonRow[])
      setCategories(((pc || []) as any[]).map(r => r.categories?.name).filter(Boolean))
      setUnitsSold30d((items || []).reduce((s: number, i: any) => s + Number(i.quantity), 0))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [productId])

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Package className="w-4 h-4 text-slate-400 shrink-0" />
            <h2 className="font-bold text-slate-900 truncate">{product?.name || 'Product'}</h2>
          </div>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-slate-100 rounded-xl shrink-0">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading…</div>
        ) : !product ? (
          <div className="p-8 text-center text-sm text-slate-400">Product not found (may have been deleted).</div>
        ) : (
          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
            <div className="flex items-center gap-3">
              {product.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.image_url} alt="" className="w-14 h-14 rounded-xl object-cover border border-slate-200" />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-2xl">
                  {product.icon || '🛒'}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {!product.is_active && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Inactive</span>
                  )}
                  {product.sale_active && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                      {product.sale_label || 'SALE'}
                    </span>
                  )}
                </div>
                {categories.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap mt-1">
                    {categories.map(c => (
                      <span key={c} className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <Tag className="w-3 h-3" />{c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Price</p>
                {product.sale_active && product.sale_price != null ? (
                  <div>
                    <span className="text-sm text-slate-400 line-through mr-1">{formatCurrency(product.price)}</span>
                    <span className="font-bold text-red-600">{formatCurrency(product.sale_price)}</span>
                  </div>
                ) : (
                  <p className="font-bold text-slate-800">{formatCurrency(product.price)}</p>
                )}
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Cost Price</p>
                <p className="font-bold text-slate-800">{product.cost_price ? formatCurrency(product.cost_price) : '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Stock</p>
                <p className="font-bold text-slate-800">
                  {product.has_variants ? 'Per variant' : product.stock_quantity === null ? '∞ Unlimited' : product.stock_quantity}
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Sold (30d)</p>
                <p className="font-bold text-slate-800">{unitsSold30d ?? '—'}</p>
              </div>
            </div>

            {variants.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Variants</p>
                <div className="space-y-1">
                  {variants.map(v => (
                    <div key={v.id} className="flex justify-between items-center text-sm bg-slate-50 rounded-lg px-3 py-2">
                      <span className={v.is_active ? 'text-slate-700' : 'text-slate-400 line-through'}>{v.label}</span>
                      <span className="text-slate-500">
                        {formatCurrency(v.price)} · {v.stock_quantity === null ? '∞' : v.stock_quantity} in stock
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {addons.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Add-ons</p>
                <div className="space-y-1">
                  {addons.map(a => (
                    <div key={a.id} className="flex justify-between items-center text-sm bg-slate-50 rounded-lg px-3 py-2">
                      <span className={a.is_active ? 'text-slate-700' : 'text-slate-400 line-through'}>{a.name}</span>
                      <span className="text-slate-500">+{formatCurrency(a.price_addition)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
