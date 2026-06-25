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
    : 'text-slate-500'

  const cartBody = (
    <div className="w-full flex flex-col h-full bg-white">
      {/* Cart header */}
      <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4.5 h-4.5 text-slate-700" />
          <span className="font-semibold text-slate-900 text-sm">Order</span>
          {itemCount > 0 && (
            <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
              {itemCount}
            </span>
          )}
        </div>
        {onMobileClose && (
          <button
            onClick={onMobileClose}
            className="lg:hidden p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
              <ShoppingCart className="w-7 h-7 text-slate-300" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-500">Cart is empty</p>
              <p className="text-xs text-slate-400 mt-0.5">Tap a product to add</p>
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-0.5">
            {cart.map(item => (
              <div
                key={`${item.product_id}-${item.variant_id}`}
                className="group flex items-center gap-2.5 px-2 py-2.5 rounded-xl hover:bg-slate-50 transition-colors duration-100"
              >
                {/* Emoji */}
                <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center shrink-0 text-lg">
                  {item.icon || '📦'}
                </div>

                {/* Name + variant */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800 truncate leading-snug">{item.name}</p>
                  {item.variant_label && (
                    <p className="text-xs text-slate-400">{item.variant_label}</p>
                  )}
                  <p className="text-xs font-bold text-amber-600">{formatCurrency(item.price * item.quantity)}</p>
                </div>

                {/* Qty controls */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => updateQty(item.product_id, item.variant_id, -1)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-3 h-3 text-slate-600" />
                  </button>
                  <span className="w-7 text-center text-xs font-bold text-slate-800">{item.quantity}</span>
                  <button
                    onClick={() => updateQty(item.product_id, item.variant_id, 1)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-3 h-3 text-slate-600" />
                  </button>
                  <button
                    onClick={() => removeItem(item.product_id, item.variant_id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100 ml-0.5"
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
      <div className="border-t border-slate-100 p-4 space-y-3 shrink-0">
        {/* Balance info */}
        {loadedBochur && (
          <div className="flex items-center justify-between text-xs py-1">
            <span className="text-slate-500">Balance</span>
            <span className={`font-semibold ${balanceColor}`}>{formatCurrency(loadedBochur.balance)}</span>
          </div>
        )}

        {/* Subtotal row */}
        {cart.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Total</span>
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{formatCurrency(subtotal)}</span>
          </div>
        )}

        {/* Checkout button */}
        <button
          onClick={onCheckout}
          disabled={cart.length === 0}
          className="btn-brand-lg"
        >
          {cart.length === 0 ? 'Add items to charge' : `Charge ${formatCurrency(subtotal)}`}
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-30 backdrop-blur-sm"
          onClick={onMobileClose}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={`lg:hidden fixed inset-y-0 right-0 z-40 w-80 max-w-[90vw] shadow-2xl flex flex-col transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {cartBody}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex w-72 xl:w-80 border-l border-slate-100 flex-col h-full shrink-0">
        {cartBody}
      </div>
    </>
  )
}
