'use client'

import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import type { Product, ProductAddon } from '@/types/database'

interface Props {
  product: Product
  onConfirm: (selectedAddons: ProductAddon[]) => void
  onSkip: () => void
  onClose: () => void
}

export default function AddonModal({ product, onConfirm, onSkip, onClose }: Props) {
  const [addons, setAddons] = useState<ProductAddon[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    setLoading(true)
    supabase
      .from('product_addons')
      .select('*')
      .eq('product_id', product.id)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        setAddons(data || [])
        setLoading(false)
      })
  // supabase client is stable across renders
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id])

  function toggleAddon(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectedAddons = addons.filter(a => selected.has(a.id))
  const extrasTotal = selectedAddons.reduce((sum, a) => sum + a.price_addition, 0)

  function handleConfirm() {
    onConfirm(selectedAddons)
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fade-in">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm max-h-[90vh] flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <p className="font-bold text-slate-900 text-lg">{product.icon} {product.name}</p>
            <p className="text-slate-400 text-sm">Choose your extras</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Add-on list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[80px]">
          {loading ? (
            <>
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl animate-pulse">
                  <div className="h-4 bg-slate-200 rounded w-1/2" />
                  <div className="h-4 bg-slate-200 rounded w-16" />
                </div>
              ))}
            </>
          ) : addons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
              <p className="text-slate-500 text-sm font-medium">No add-ons available</p>
            </div>
          ) : addons.map(a => {
            const isSelected = selected.has(a.id)
            return (
              <button
                key={a.id}
                onClick={() => toggleAddon(a.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all duration-150 active:scale-[0.98] text-left ${
                  isSelected
                    ? 'border-amber-400 bg-amber-50/60'
                    : 'border-slate-100 hover:border-amber-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                    isSelected ? 'border-amber-500 bg-amber-500' : 'border-slate-300'
                  }`}>
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span className={`text-sm font-medium ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>
                    {a.name}
                  </span>
                </div>
                <span className={`text-sm font-bold ${isSelected ? 'text-amber-600' : 'text-slate-500'}`}>
                  +{formatCurrency(a.price_addition)}
                </span>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 p-4 space-y-3 shrink-0">
          {extrasTotal > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Extras</span>
              <span className="font-semibold text-slate-800">+{formatCurrency(extrasTotal)}</span>
            </div>
          )}
          <button
            onClick={handleConfirm}
            className="btn-brand-lg"
          >
            {selected.size > 0 ? `Add to cart (+${formatCurrency(extrasTotal)})` : 'Add to cart'}
          </button>
          <button
            onClick={onSkip}
            className="w-full text-center text-sm text-slate-400 hover:text-slate-600 transition-colors py-1"
          >
            No extras
          </button>
        </div>
      </div>
    </div>
  )
}
