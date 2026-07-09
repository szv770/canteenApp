'use client'

import { useState } from 'react'
import { X, Zap, Check, User } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { CartItem, BochurWithId } from '@/types/database'

interface Props {
  cart: CartItem[]
  loadedBochur: BochurWithId
  onClose: () => void
  onSuccess: () => void
}

export default function QuickChargeModal({ cart, loadedBochur, onClose, onSuccess }: Props) {
  const [processing, setProcessing] = useState(false)

  const total = Math.round(cart.reduce((sum, i) => sum + (i.price + (i.addon_total || 0)) * i.quantity, 0) * 100) / 100
  const balanceAfter = Math.round((loadedBochur.balance - total) * 100) / 100

  const allowNegative = loadedBochur.allow_negative ?? false
  const maxNeg = loadedBochur.max_negative_balance ?? 0
  // Block when the new balance would drop below the allowed negative floor (-maxNeg)
  const blocked = balanceAfter < 0 && (!allowNegative || -balanceAfter > maxNeg)
  const frozen = loadedBochur.is_frozen

  async function confirmCharge() {
    if (processing || blocked || frozen) return
    setProcessing(true)
    try {
      const res = await fetch('/api/pos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'balance',
          bochur_id: loadedBochur.id,
          tip_amount: 0,
          items: cart.map(item => ({
            product_id: item.product_id,
            variant_id: item.variant_id,
            quantity: item.quantity,
            addon_ids: item.addon_ids ?? [],
            bundle_id: item.bundle_id ?? null,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Charge failed')
      toast.success(`Charged ${formatCurrency(total)} to ${loadedBochur.name}`)
      onSuccess()
    } catch (err: any) {
      const msg = err?.message || ''
      if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network')) {
        toast.error('Network error — please check your connection and try again', { duration: 5000 })
      } else {
        toast.error(msg || 'Charge failed — please try again')
      }
      setProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fade-in">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[95vh] sm:max-h-[90vh] flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-pos-border shrink-0">
          <h2 className="font-bold text-pos-text text-xl flex items-center gap-2">
            <Zap className="w-5 h-5 text-emerald-500" />
            Charge to Account
          </h2>
          <button
            onClick={onClose}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-pos-hover rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-pos-muted" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Bochur */}
          <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 text-sm truncate">{loadedBochur.name}</p>
              <p className="text-xs text-slate-500">
                Balance <span className={`font-bold ${loadedBochur.balance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(loadedBochur.balance)}</span>
              </p>
            </div>
          </div>

          {/* Items */}
          <div className="px-4 sm:px-5 py-3 border-b border-slate-100 max-h-40 overflow-y-auto">
            {cart.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm py-0.5 gap-2">
                <div className="min-w-0">
                  <span className="text-slate-700">
                    {item.quantity}× {item.name}{item.variant_label ? ` (${item.variant_label})` : ''}
                  </span>
                  {item.addon_names && item.addon_names.length > 0 && (
                    <p className="text-slate-400 text-xs leading-tight">+ {item.addon_names.join(', ')}</p>
                  )}
                </div>
                <span className="text-slate-500 font-medium shrink-0">{formatCurrency((item.price + (item.addon_total || 0)) * item.quantity)}</span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="px-4 sm:px-5 py-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Total</span>
              <span className="font-bold text-slate-900 text-lg">{formatCurrency(total)}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-slate-100 pt-2">
              <span className="text-slate-500">New balance</span>
              <span className={`font-bold ${balanceAfter >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {formatCurrency(balanceAfter)}
              </span>
            </div>
          </div>

          {frozen && (
            <div className="mx-4 sm:mx-5 mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-medium">
              This account is frozen and cannot be charged.
            </div>
          )}
          {!frozen && blocked && (
            <div className="mx-4 sm:mx-5 mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-medium">
              This charge would exceed the account's negative balance limit. Use cash or card instead.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 pb-5 pt-3 border-t border-pos-border shrink-0">
          <button
            onClick={confirmCharge}
            disabled={processing || blocked || frozen}
            className="w-full min-h-[56px] rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-base flex items-center justify-center gap-2 transition-colors"
          >
            {processing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                Confirm — Charge {formatCurrency(total)}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
