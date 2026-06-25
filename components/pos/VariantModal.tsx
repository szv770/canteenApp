'use client'

import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import type { Product, ProductVariant } from '@/types/database'

interface Props {
  product: Product
  onSelect: (variant: ProductVariant) => void
  onClose: () => void
}

export default function VariantModal({ product, onSelect, onClose }: Props) {
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const firstBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('product_variants')
      .select('*')
      .eq('product_id', product.id)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        setVariants(data || [])
        setLoading(false)
      })
  // supabase client is stable across renders
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id])

  // Focus first variant button once loaded
  useEffect(() => {
    if (!loading && variants.length > 0) {
      firstBtnRef.current?.focus()
    }
  }, [loading, variants.length])

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fade-in">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm max-h-[90vh] flex flex-col animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <p className="font-bold text-slate-900 text-lg">{product.icon} {product.name}</p>
            <p className="text-slate-400 text-sm">Choose a size or option</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-4 grid grid-cols-2 gap-2.5 overflow-y-auto min-h-[100px]">
          {loading ? (
            <>
              {[0, 1].map(i => (
                <div key={i} className="flex flex-col items-center p-4 border-2 border-slate-100 rounded-xl animate-pulse">
                  <div className="h-4 bg-slate-200 rounded w-2/3 mb-2" />
                  <div className="h-5 bg-slate-200 rounded w-1/2" />
                </div>
              ))}
            </>
          ) : variants.map((v, idx) => (
            <button
              key={v.id}
              ref={idx === 0 ? firstBtnRef : undefined}
              onClick={() => onSelect(v)}
              className="group flex flex-col items-center p-4 min-h-[88px] border-2 border-slate-100 rounded-xl hover:border-amber-400 hover:bg-amber-50/50 transition-all duration-150 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            >
              <span className="font-semibold text-slate-800 text-sm group-hover:text-slate-900">{v.label}</span>
              <span className="text-amber-600 font-bold mt-1.5 text-base">{formatCurrency(v.price)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
