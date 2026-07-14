'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { X, Boxes } from 'lucide-react'
import ProductQuickViewModal from './ProductQuickViewModal'

interface Props {
  bundleId: string
  onClose: () => void
}

interface BundleItemRow {
  id: string
  product_id: string
  quantity: number
  products: { name: string; icon: string | null } | null
}

interface BundleRow {
  id: string
  name: string
  description: string | null
  price: number
  original_price: number | null
  icon: string | null
  is_active: boolean
}

export default function BundleQuickViewModal({ bundleId, onClose }: Props) {
  const supabase = createClient()
  const [bundle, setBundle] = useState<BundleRow | null>(null)
  const [items, setItems] = useState<BundleItemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [viewingProductId, setViewingProductId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase.from('product_bundles')
      .select('*, bundle_items(id, product_id, quantity, products(name, icon))')
      .eq('id', bundleId).single()
      .then(({ data }) => {
        if (cancelled) return
        setBundle(data as any)
        setItems(((data as any)?.bundle_items || []) as BundleItemRow[])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [bundleId])

  const savings = bundle?.original_price ? bundle.original_price - bundle.price : null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Boxes className="w-4 h-4 text-slate-400 shrink-0" />
            <h2 className="font-bold text-slate-900 truncate">{bundle?.name || 'Bundle'}</h2>
          </div>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-slate-100 rounded-xl shrink-0">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading…</div>
        ) : !bundle ? (
          <div className="p-8 text-center text-sm text-slate-400">Bundle not found (may have been deleted).</div>
        ) : (
          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
            {!bundle.is_active && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Inactive</span>
            )}
            {bundle.description && <p className="text-sm text-slate-500">{bundle.description}</p>}

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Bundle Price</p>
                <p className="font-bold text-slate-800">{formatCurrency(bundle.price)}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Savings</p>
                <p className="font-bold text-emerald-600">{savings && savings > 0 ? formatCurrency(savings) : '—'}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Contains</p>
              <div className="space-y-1">
                {items.map(i => (
                  <button
                    key={i.id}
                    onClick={() => setViewingProductId(i.product_id)}
                    className="w-full flex justify-between items-center text-sm bg-slate-50 hover:bg-indigo-50 rounded-lg px-3 py-2 text-left transition-colors"
                  >
                    <span className="text-slate-700 flex items-center gap-1.5">
                      <span>{i.products?.icon || '🛒'}</span>
                      {i.products?.name || 'Unknown product'}
                    </span>
                    <span className="text-slate-500">×{i.quantity}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {viewingProductId && (
        <ProductQuickViewModal productId={viewingProductId} onClose={() => setViewingProductId(null)} />
      )}
    </div>
  )
}
