'use client'

import { useState } from 'react'
import { X, DollarSign, CreditCard, Wallet, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
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
  const supabase = createClient()
  const [method, setMethod] = useState<PayMethod>(loadedBochur ? 'balance' : 'cash')
  const [cashTendered, setCashTendered] = useState('')
  const [processing, setProcessing] = useState(false)

  const coinRounding = settings['coin_rounding'] === 'true'
  const ccFeePercent = parseFloat(settings['cc_fee_percent'] || '3')

  const rawSubtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const subtotal = coinRounding && method === 'cash' ? roundCash(rawSubtotal) : rawSubtotal
  const ccFee = method === 'credit_card' ? calcCCFee(rawSubtotal, ccFeePercent) : 0
  const total = rawSubtotal + ccFee
  const displayTotal = coinRounding && method === 'cash' ? roundCash(rawSubtotal) : total

  const tendered = parseFloat(cashTendered) || 0
  const change = Math.max(0, Math.round((tendered - displayTotal) * 100) / 100)

  const balanceAfter = loadedBochur ? loadedBochur.balance - rawSubtotal : 0
  const insufficientBalance = loadedBochur && loadedBochur.balance < rawSubtotal
  const allowNegative = loadedBochur?.allow_negative ?? false
  const maxNeg = loadedBochur?.max_negative_balance ?? 0
  const balanceBlocked = insufficientBalance && (!allowNegative || (allowNegative && -balanceAfter > maxNeg))

  async function processOrder() {
    if (processing) return
    if (method === 'balance' && balanceBlocked) {
      toast.error('Insufficient balance')
      return
    }

    setProcessing(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: cashier } = await supabase
        .from('cashier_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()

      // Create order
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          bochur_id: loadedBochur?.id ?? null,
          cashier_id: cashier?.id,
          subtotal: rawSubtotal,
          discount_amount: 0,
          tax_amount: 0,
          total: method === 'credit_card' ? total : rawSubtotal,
          status: 'completed',
        })
        .select()
        .single()

      if (orderErr || !order) throw new Error('Failed to create order')

      // Order items
      await supabase.from('order_items').insert(
        cart.map(item => ({
          order_id: order.id,
          product_id: item.product_id,
          variant_id: item.variant_id,
          product_name: item.name,
          variant_label: item.variant_label,
          quantity: item.quantity,
          unit_price: item.price,
          discount_amount: 0,
          total: item.price * item.quantity,
        }))
      )

      // Payment
      await supabase.from('payments').insert({
        order_id: order.id,
        method,
        amount: method === 'credit_card' ? total : rawSubtotal,
        cash_tendered: method === 'cash' ? tendered : null,
        change_given: method === 'cash' ? change : null,
        cc_fee: ccFee || null,
      })

      // Balance deduction
      if (method === 'balance' && loadedBochur) {
        await supabase
          .from('bochurim')
          .update({ balance: balanceAfter })
          .eq('id', loadedBochur.id)

        await supabase.from('balance_ledger').insert({
          bochur_id: loadedBochur.id,
          amount: -rawSubtotal,
          type: 'purchase',
          reference_id: order.id,
          cashier_id: cashier?.id,
        })
      }

      // Update stock
      for (const item of cart) {
        if (item.variant_id) {
          await supabase.rpc('decrement_variant_stock', {
            v_id: item.variant_id,
            qty: item.quantity,
          })
        } else {
          const { data: prod } = await supabase
            .from('products')
            .select('stock_quantity')
            .eq('id', item.product_id)
            .single()
          if (prod) {
            await supabase
              .from('products')
              .update({ stock_quantity: Math.max(0, prod.stock_quantity - item.quantity) })
              .eq('id', item.product_id)
          }
        }
      }

      onSuccess()
    } catch (err: any) {
      toast.error(err.message || 'Order failed')
      setProcessing(false)
    }
  }

  const tabs: { id: PayMethod; label: string; icon: React.ReactNode }[] = [
    ...(loadedBochur ? [{ id: 'balance' as PayMethod, label: 'Balance', icon: <Wallet className="w-4 h-4" /> }] : []),
    { id: 'cash', label: 'Cash', icon: <DollarSign className="w-4 h-4" /> },
    { id: 'credit_card', label: 'Card', icon: <CreditCard className="w-4 h-4" /> },
  ]

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-pos-border">
          <h2 className="font-bold text-pos-text text-xl">Checkout</h2>
          <button onClick={onClose} className="p-2 hover:bg-pos-hover rounded-xl transition-colors">
            <X className="w-5 h-5 text-pos-muted" />
          </button>
        </div>

        {/* Order summary */}
        <div className="px-5 py-3 border-b border-pos-border max-h-36 overflow-y-auto">
          {cart.map(item => (
            <div key={`${item.product_id}-${item.variant_id}`} className="flex justify-between text-sm py-0.5">
              <span className="text-pos-text">
                {item.quantity}× {item.name}{item.variant_label ? ` (${item.variant_label})` : ''}
              </span>
              <span className="text-pos-subtext font-medium">{formatCurrency(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>

        {/* Payment method tabs */}
        <div className="px-5 pt-4">
          <div className="flex gap-1 bg-pos-bg rounded-xl p-1 mb-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setMethod(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
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
                placeholder="Cash tendered"
                value={cashTendered}
                onChange={e => setCashTendered(e.target.value)}
                className="input-field text-lg font-semibold"
                min={0}
                step={0.01}
              />
              <div className="grid grid-cols-6 gap-1">
                {QUICK_CASH.map(amt => (
                  <button
                    key={amt}
                    onClick={() => setCashTendered(String(amt))}
                    className="py-1.5 bg-pos-bg hover:bg-pos-hover border border-pos-border rounded-lg text-xs font-medium text-pos-text transition-colors"
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

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            onClick={processOrder}
            disabled={processing || (method === 'balance' && !!balanceBlocked) || (method === 'cash' && tendered < displayTotal)}
            className="btn-brand-lg"
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
