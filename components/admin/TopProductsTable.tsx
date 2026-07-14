'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import ProductQuickViewModal from '@/components/admin/ProductQuickViewModal'

interface TopProduct {
  id: string | null
  name: string
  qty: number
  revenue: number
}

export default function TopProductsTable({ products }: { products: TopProduct[] }) {
  const [viewProductId, setViewProductId] = useState<string | null>(null)

  if (products.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-slate-400">No sales data yet</p>
      </div>
    )
  }

  const maxQty = products[0]?.qty || 1

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[400px]">
        <thead>
          <tr className="border-b border-slate-50 bg-slate-50/50">
            <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Product</th>
            <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Units Sold</th>
            <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Revenue</th>
            <th className="px-5 py-3 w-40"></th>
          </tr>
        </thead>
        <tbody>
          {products.map((p, i) => {
            const pct = (p.qty / maxQty) * 100
            return (
              <tr key={p.id || p.name} className="table-row border-b border-slate-50 last:border-0">
                <td className="px-5 py-3 text-sm font-medium text-slate-900">
                  <span className="text-slate-400 text-xs mr-2">#{i + 1}</span>
                  {p.id ? (
                    <button
                      type="button"
                      onClick={() => setViewProductId(p.id)}
                      className="hover:underline hover:text-indigo-600 text-left"
                    >
                      {p.name}
                    </button>
                  ) : p.name}
                </td>
                <td className="px-5 py-3 text-sm font-bold text-slate-900 text-right">{p.qty}</td>
                <td className="px-5 py-3 text-sm font-semibold text-slate-700 text-right">{formatCurrency(p.revenue)}</td>
                <td className="px-5 py-3">
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className="bg-emerald-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {viewProductId && (
        <ProductQuickViewModal productId={viewProductId} onClose={() => setViewProductId(null)} />
      )}
    </div>
  )
}
