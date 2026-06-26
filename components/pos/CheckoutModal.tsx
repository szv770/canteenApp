'use client'

import { useState } from 'react'
import { X, DollarSign, CreditCard, Wallet, Check } from 'lucide-react'
import { formatCurrency, roundCash, calcCCFee, applyDiscount } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { CartItem, BochurWithId } from '@/types/database'

interface Props {
  cart: CartItem[]
  loadedBochur: BochurWithId | null
  settings: Record<string, string>
  cashierName: string
  onClose: () => void
  onSuccess: () => void
}

type PayMethod = 'balance' | 'cash' | 'credit_card'

const QUICK_CASH = [1, 5, 10, 20, 50, 100]

export default function CheckoutModal({ cart, loadedBochur, settings, cashierName, onClose, onSuccess }: Props) {
  const [method, setMethod] = useState<PayMethod>(loadedBochur ? 'balance' : 'cash')
  const [cashTendered, setCashTendered] = useState('')
  const [processing, setProcessing] = useState(false)
  const [discountCodeInput, setDiscountCodeInput] = useState('')
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; amount: number; description: string } | null>(null)
  const [discountError, setDiscountError] = useState('')
  const [applyingDiscount, setApplyingDiscount] = useState(false)

  const coinRounding = settings['coin_rounding'] === 'true'
  const ccFeePercent = parseFloat(settings['cc_fee_percent'] || '3')

  const rawSubtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const discountAmount = appliedDiscount?.amount ?? 0
  const subtotalAfterDiscount = Math.max(0, Math.round((rawSubtotal - discountAmount) * 100) / 100)
  const subtotal = coinRounding && method === 'cash' ? roundCash(subtotalAfterDiscount) : subtotalAfterDiscount
  const ccFee = method === 'credit_card' ? calcCCFee(subtotalAfterDiscount, ccFeePercent) : 0
  const total = subtotalAfterDiscount + ccFee
  const displayTotal = coinRounding && method === 'cash' ? roundCash(subtotalAfterDiscount) : total

  const tendered = parseFloat(cashTendered) || 0
  const change = Math.max(0, Math.round((tendered - displayTotal) * 100) / 100)

  const balanceAfter = loadedBochur ? loadedBochur.balance - subtotalAfterDiscount : 0
  const insufficientBalance = loadedBochur && loadedBochur.balance < subtotalAfterDiscount
  const allowNegative = loadedBochur?.allow_negative ?? false
  const maxNeg = loadedBochur?.max_negative_balance ?? 0
  const balanceBlocked = insufficientBalance && (!allowNegative || (allowNegative && -balanceAfter > maxNeg))

  async function applyDiscountCode() {
    if (!discountCodeInput.trim()) return
    setApplyingDiscount(true)
    setDiscountError('')
    setAppliedDiscount(null)
    try {
      const res = await fetch('/api/pos/apply-discount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: discountCodeInput.trim(), subtotal: rawSubtotal }),
      })
      const json = await res.json()
      if (json.valid) {
        setAppliedDiscount({ code: json.code, amount: json.discount_amount, description: json.description })
      } else {
        setDiscountError(json.error || 'Invalid code')
      }
    } catch {
      setDiscountError('Failed to apply code — check your connection')
    } finally {
      setApplyingDiscount(false)
    }
  }

  async function processOrder() {
    if (processing) return
    if (method === 'balance' && balanceBlocked) {
      toast.error('Insufficient balance')
      return
    }

    setProcessing(true)
    try {
      // Send to server-side route which re-fetches prices and validates everything.
      // Never trust client-side price calculations for the actual transaction.
      const res = await fetch('/api/pos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method,
          bochur_id: loadedBochur?.id ?? null,
          cash_tendered: method === 'cash' ? tendered : null,
          discount_code: appliedDiscount?.code ?? null,
          items: cart.map(item => ({
            product_id: item.product_id,
            variant_id: item.variant_id,
            quantity: item.quantity,
            // Note: unit prices are NOT sent — the server re-fetches them from DB
          })),
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Order failed')
      }

      onSuccess()
    } catch (err: any) {
      const msg = err?.message || ''
      if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('failed to fetch')) {
        toast.error('Network error — please check your connection and try again', { duration: 5000 })
      } else {
        toast.error(msg || 'Order failed — please try again')
      }
      setProcessing(false)
    }
  }

  const tabs: { id: PayMethod; label: string; icon: React.ReactNode }[] = [
    ...(loadedBochur ? [{ id: 'balance' as PayMethod, label: 'Balance', icon: <Wallet className="w-4 h-4" /> }] : []),
    { id: 'cash', label: 'Cash', icon: <DollarSign className="w-4 h-4" /> },
    { id: 'credit_card', label: 'Card', icon: <CreditCard className="w-4 h-4" /> },
  ]

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fade-in">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[95vh] sm:max-h-[90vh] flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-pos-border shrink-0">
          <h2 className="font-bold text-pos-text text-xl">Checkout</h2>
          <button
            onClick={onClose}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-pos-hover rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-pos-muted" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Order summary */}
          <div className="px-4 sm:px-5 py-3 border-b border-pos-border max-h-36 overflow-y-auto">
            {cart.map(item => (
              <div key={`${item.product_id}-${item.variant_id}`} className="flex justify-between text-sm py-0.5">
                <span className="text-pos-text">
                  {item.quantity}× {item.name}{item.variant_label ? ` (${item.variant_label})` : ''}
                </span>
                <span className="text-pos-subtext font-medium ml-2 shrink-0">{formatCurrency(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>

          {/* Payment method tabs */}
          <div className="px-4 sm:px-5 pt-4">
            <div className="flex gap-1 bg-pos-bg rounded-xl p-1 mb-4">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setMethod(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-all ${
                    method === tab.id
                      ? 'bg-white text-pos-text shadow-sm'
                      : 'text-pos-subtext hover:text-pos-text'
                  }`}
                >
                  {tab.icon}{tab.label}
                </button>
              ))}
            </div>

            {/* Balance tab */}
            {method === 'balance' && loadedBochur && (
              <div className="space-y-3 mb-4">
                <div className="bg-pos-bg rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-pos-subtext">Current balance</span>
                    <span className="font-semibold text-pos-text">{formatCurrency(loadedBochur.balance)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-pos-subtext">This order</span>
                    <span className="font-semibold text-red-500">-{formatCurrency(rawSubtotal)}</span>
                  </div>
                  <div className="border-t border-pos-border pt-2 flex justify-between">
                    <span className="text-sm font-medium text-pos-text">Remaining</span>
                    <span className={`font-bold ${balanceAfter >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {formatCurrency(balanceAfter)}
                    </span>
                  </div>
                </div>
                {balanceBlocked && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                    Insufficient balance. Please use cash or card.
                  </div>
                )}
              </div>
            )}

            {/* Cash tab */}
            {method === 'cash' && (
              <div className="space-y-3 mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-pos-subtext">Amount due</span>
                  <span className="font-bold text-pos-text text-lg">{formatCurrency(displayTotal)}</span>
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="Cash tendered"
                  value={cashTendered}
                  onChange={e => setCashTendered(e.target.value)}
                  className="input-field text-base font-semibold min-h-[44px]"
                  min={0}
                  step={0.01}
                  autoFocus
                />
                <div className="grid grid-cols-6 gap-1">
                  {QUICK_CASH.map(amt => (
                    <button
                      key={amt}
                      onClick={() => setCashTendered(String(amt))}
                      className="py-2 min-h-[44px] bg-pos-bg hover:bg-pos-hover border border-pos-border rounded-lg text-xs font-medium text-pos-text transition-colors"
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
                {tendered >= displayTotal && (
                  <div className="flex justify-between items-center p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <span className="text-emerald-700 font-medium text-sm">Change due</span>
                    <span className="text-emerald-700 font-bold text-xl">{formatCurrency(change)}</span>
                  </div>
                )}
              </div>
            )}

            {/* CC tab */}
            {method === 'credit_card' && (
              <div className="space-y-3 mb-4">
                <div className="bg-pos-bg rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-pos-subtext">Subtotal</span>
                    <span className="text-pos-text font-medium">{formatCurrency(rawSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-pos-subtext">CC fee ({ccFeePercent}%)</span>
                    <span className="text-pos-text font-medium">{formatCurrency(ccFee)}</span>
                  </div>
                  <div className="border-t border-pos-border pt-2 flex justify-between">
                    <span className="font-semibold text-pos-text">Total</span>
                    <span className="font-bold text-pos-text">{formatCurrency(total)}</span>
                  </div>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-600 text-sm text-center">
                  Stripe Terminal coming soon
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer - sticky at bottom */}
        <div className="px-4 sm:px-5 pb-5 pt-3 border-t border-pos-border shrink-0">
          <button
            onClick={processOrder}
            disabled={processing || (method === 'balance' && !!balanceBlocked) || (method === 'cash' && tendered < displayTotal)}
            className="btn-brand-lg min-h-[56px]"
          >
            {processing ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Check className="w-5 h-5" />
                Complete Order · {formatCurrency(method === 'credit_card' ? total : displayTotal)}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
