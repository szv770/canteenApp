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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fade-in">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm max-h-[90vh] flex flex-col animate-scale-in">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-pos-border shrink-0">
          <div>
            <p className="font-bold text-pos-text text-lg">{product.icon} {product.name}</p>
            <p className="text-pos-subtext text-sm">Choose a size</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-pos-hover rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-pos-muted" />
          </button>
        </div>
        <div className="p-4 grid grid-cols-2 gap-3 overflow-y-auto min-h-[100px]">
          {loading ? (
            <>
              {[0, 1].map(i => (
                <div key={i} className="flex flex-col items-center p-4 border-2 border-pos-border rounded-xl animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
                  <div className="h-5 bg-gray-200 rounded w-1/2" />
                </div>
              ))}
            </>
          ) : variants.map((v, idx) => (
            <button
              key={v.id}
              ref={idx === 0 ? firstBtnRef : undefined}
              onClick={() => onSelect(v)}
              className="flex flex-col items-center p-4 min-h-[80px] border-2 border-pos-border rounded-xl hover:border-brand hover:bg-brand-lighter transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand/50"
            >
              <span className="font-semibold text-pos-text">{v.label}</span>
              <span className="text-brand font-bold mt-1">{formatCurrency(v.price)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
