'use client'

import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
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
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('product_variants')
      .select('*')
      .eq('product_id', product.id)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setVariants(data || []))
  }, [product.id])

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm animate-scale-in">
        <div className="flex items-center justify-between p-5 border-b border-pos-border">
          <div>
            <p className="font-bold text-pos-text text-lg">{product.emoji} {product.name}</p>
            <p className="text-pos-subtext text-sm">Choose a size</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-pos-hover rounded-xl transition-colors">
            <X className="w-5 h-5 text-pos-muted" />
          </button>
        </div>
        <div className="p-4 grid grid-cols-2 gap-2">
          {variants.map(v => (
            <button
              key={v.id}
              onClick={() => onSelect(v)}
              className="flex flex-col items-center p-4 border-2 border-pos-border rounded-xl hover:border-brand hover:bg-brand-lighter transition-all active:scale-95"
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
