'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { X, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Product } from '@/types/database'

interface Props {
  cashierId: string
  onClose: () => void
}

export default function WastageModal({ cashierId, onClose }: Props) {
  const supabase = createClient()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [reason, setReason] = useState('')
  const [deductStock, setDeductStock] = useState(true)

  useEffect(() => {
    supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        setProducts(data || [])
        setLoading(false)
      })
  // supabase client is stable across renders
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredProducts = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  )

  const totalLoss = selectedProduct ? (selectedProduct.cost_price ?? 0) * quantity : 0

  async function handleSubmit() {
    if (!selectedProduct) { toast.error('Select a product'); return }
    if (!reason.trim()) { toast.error('Reason is required'); return }
    if (quantity < 1) { toast.error('Quantity must be at least 1'); return }

    setSubmitting(true)
    try {
      const { error: wasteErr } = await supabase.from('wastage_log').insert({
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        quantity,
        reason: reason.trim(),
        unit_cost: selectedProduct.cost_price ?? 0,
        unit_price: selectedProduct.price,
        cashier_id: cashierId,
      })
      if (wasteErr) throw wasteErr

      // Deduct stock if applicable
      if (
        deductStock &&
        selectedProduct.stock_quantity !== null &&
        !selectedProduct.has_variants
      ) {
        const newQty = Math.max(0, (selectedProduct.stock_quantity ?? 0) - quantity)
        await supabase
          .from('products')
          .update({ stock_quantity: newQty })
          .eq('id', selectedProduct.id)
      }

      // Insert admin notification
      await supabase.from('cashier_notifications').insert({
        message: `⚠️ Waste logged: ${quantity}× ${selectedProduct.name} — ${reason.trim()}`,
        type: 'warning',
        is_active: true,
        created_by: cashierId,
      })

      toast.success('Waste logged')
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to log waste')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <p className="font-bold text-slate-900 text-lg flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              Log Waste
            </p>
            <p className="text-slate-400 text-sm">Record a product loss or spoilage</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Product search */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Product</label>
            {selectedProduct ? (
              <div className="flex items-center justify-between p-3 bg-amber-50 border-2 border-amber-300 rounded-xl">
                <div>
                  <span className="font-semibold text-slate-900">
                    {selectedProduct.icon} {selectedProduct.name}
                  </span>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Cost: {formatCurrency(selectedProduct.cost_price ?? 0)}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  placeholder="Search products..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
                />
                {search && (
                  <div className="mt-1 border border-slate-200 rounded-xl overflow-hidden max-h-40 overflow-y-auto shadow-sm">
                    {loading ? (
                      <div className="p-3 text-sm text-slate-400">Loading...</div>
                    ) : filteredProducts.length === 0 ? (
                      <div className="p-3 text-sm text-slate-400">No products found</div>
                    ) : filteredProducts.slice(0, 8).map(p => (
                      <button
                        key={p.id}
                        onClick={() => { setSelectedProduct(p); setSearch('') }}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 text-left border-b border-slate-100 last:border-0"
                      >
                        <span className="text-sm text-slate-800">{p.icon} {p.name}</span>
                        <span className="text-xs text-slate-500">Cost: {formatCurrency(p.cost_price ?? 0)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Quantity Lost</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
            />
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Reason <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Dropped, expired, damaged..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
            />
          </div>

          {/* Calculated loss */}
          {selectedProduct && (
            <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Calculated Loss</span>
                <span className="font-bold text-red-600 text-lg">{formatCurrency(totalLoss)}</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {quantity} × {formatCurrency(selectedProduct.cost_price ?? 0)} cost price
              </p>
            </div>
          )}

          {/* Deduct stock checkbox */}
          {selectedProduct &&
            selectedProduct.stock_quantity !== null &&
            !selectedProduct.has_variants && (
            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-slate-50 border border-slate-100">
              <input
                type="checkbox"
                checked={deductStock}
                onChange={e => setDeductStock(e.target.checked)}
                className="w-4 h-4 accent-amber-500"
              />
              <div>
                <p className="text-sm font-medium text-slate-700">Also deduct from stock</p>
                <p className="text-xs text-slate-400">
                  Current: {selectedProduct.stock_quantity} → {Math.max(0, selectedProduct.stock_quantity - quantity)} after
                </p>
              </div>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 p-4 shrink-0">
          <button
            onClick={handleSubmit}
            disabled={submitting || !selectedProduct || !reason.trim()}
            className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-xl transition-colors"
          >
            {submitting ? 'Logging...' : 'Log Waste'}
          </button>
        </div>
      </div>
    </div>
  )
}
