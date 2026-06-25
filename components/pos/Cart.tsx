'use client'

import { useState } from 'react'
import { ShoppingCart, Trash2, Plus, Minus, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { CartItem, BochurWithId } from '@/types/database'

interface Props {
  cart: CartItem[]
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>
  loadedBochur: BochurWithId | null
  settings: Record<string, string>
  onCheckout: () => void
  /** Mobile: whether the cart drawer is open */
  mobileOpen?: boolean
  /** Mobile: close the cart drawer */
  onMobileClose?: () => void
}

export default function CartPanel({ cart, setCart, loadedBochur, settings, onCheckout, mobileOpen, onMobileClose }: Props) {
  function updateQty(productId: string, variantId: string | null, delta: number) {
    setCart(prev =>
      prev.flatMap(item => {
        if (item.product_id !== productId || item.variant_id !== variantId) return [item]
        const newQty = item.quantity + delta
        if (newQty <= 0) return []
        return [{ ...item, quantity: newQty }]
      })
    )
  }

  function removeItem(productId: string, variantId: string | null) {
    setCart(prev => prev.filter(i => !(i.product_id === productId && i.variant_id === variantId)))
  }

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0)
  const balanceColor = loadedBochur
    ? (loadedBochur.balance >= subtotal ? 'text-emerald-600' : 'text-red-500')
    : 'text-pos-subtext'

  const cartBody = (
    <div className="w-full flex flex-col h-full">
      {/* Cart header */}
      <div className="px-4 py-3 border-b border-pos-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-pos-text" />
          <span className="font-semibold text-pos-text">Order</span>
        </div>
        <div className="flex items-center gap-2">
          {itemCount > 0 && (
            <span className="badge bg-brand-light text-brand">{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
          )}
          {/* Close button on mobile */}
          {onMobileClose && (
            <button
              onClick={onMobileClose}
              className="lg:hidden p-2 hover:bg-pos-hover rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5 text-pos-muted" />
            </button>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-pos-muted gap-2 py-12">
            <ShoppingCart className="w-10 h-10 opacity-30" />
            <p className="text-sm">Cart is empty</p>
            <p className="text-xs opacity-60">Tap a product to add</p>
          </div>
        ) : (
          <div className="p-3 space-y-1">
            {cart.map(item => (
              <div
                key={`${item.product_id}-${item.variant_id}`}
                className="group flex items-center gap-2 p-2 rounded-xl hover:bg-pos-hover transition-colors"
              >
                {/* Emoji */}
                <div className="w-10 h-10 bg-pos-bg rounded-lg flex items-center justify-center shrink-0 text-xl">
                  {item.icon || '📦'}
                </div>

                {/* Name + variant */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-pos-text truncate">{item.name}</p>
                  {item.variant_label && (
                    <p className="text-xs text-pos-muted">{item.variant_label}</p>
                  )}
                  <p className="text-xs font-bold text-brand">{formatCurrency(item.price * item.quantity)}</p>
                </div>

                {/* Qty controls */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => updateQty(item.product_id, item.variant_id, -1)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-pos-hover hover:bg-gray-200 transition-colors"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-3.5 h-3.5 text-pos-subtext" />
                  </button>
                  <span className="w-6 text-center text-xs font-semibold text-pos-text">{item.quantity}</span>
                  <button
                    onClick={() => updateQty(item.product_id, item.variant_id, 1)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-pos-hover hover:bg-gray-200 transition-colors"
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-3.5 h-3.5 text-pos-subtext" />
                  </button>
                  <button
                    onClick={() => removeItem(item.product_id, item.variant_id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-pos-muted hover:bg-red-50 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 ml-1"
                    aria-label="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-pos-border p-4 space-y-3 shrink-0">
        {/* Balance info */}
        {loadedBochur && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-pos-subtext">Balance</span>
            <span className={`font-semibold ${balanceColor}`}>{formatCurrency(loadedBochur.balance)}</span>
          </div>
        )}

        {/* Total */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-pos-subtext">Total</span>
          <span className="text-2xl font-bold text-pos-text">{formatCurrency(subtotal)}</span>
        </div>

        {/* Charge button */}
        <button
          onClick={onCheckout}
          disabled={cart.length === 0}
          className="btn-brand-lg"
        >
          Charge {formatCurrency(subtotal)}
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-30"
          onClick={onMobileClose}
        />
      )}

      {/* Mobile slide-in drawer */}
      <div
        className={`lg:hidden fixed inset-y-0 right-0 z-40 w-80 max-w-[90vw] bg-white shadow-2xl flex flex-col transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {cartBody}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex w-72 xl:w-80 bg-white border-l border-pos-border flex-col h-full shrink-0">
        {cartBody}
      </div>
    </>
  )
}
