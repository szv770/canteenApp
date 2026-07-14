'use client'

import { useState } from 'react'
import ProductQuickViewModal from '@/components/admin/ProductQuickViewModal'

interface LowStockProduct {
  id: string
  name: string
  icon: string | null
  stock_quantity: number | null
}

export default function LowStockList({ products }: { products: LowStockProduct[] }) {
  const [viewProductId, setViewProductId] = useState<string | null>(null)

  if (products.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-slate-400 font-medium">All stocked up!</p>
        <p className="text-xs text-slate-300 mt-1">No items running low</p>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-1">
      {products.map(p => (
        <div key={p.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-2.5">
            <span className="text-lg leading-none">{p.icon || '📦'}</span>
            <button
              type="button"
              onClick={() => setViewProductId(p.id)}
              className="text-sm text-slate-700 font-medium hover:underline hover:text-indigo-600 text-left"
            >
              {p.name}
            </button>
          </div>
          <span className={`badge ${(p.stock_quantity ?? 0) <= 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
            {p.stock_quantity}
          </span>
        </div>
      ))}

      {viewProductId && (
        <ProductQuickViewModal productId={viewProductId} onClose={() => setViewProductId(null)} />
      )}
    </div>
  )
}
