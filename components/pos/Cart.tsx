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
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export default function CartPanel({ cart, setCart, loadedBochur, settings, onCheckout, mobileOpen, onMobileClose }: Props) {
  function updateQty(productId: string, variantId: string | null, qty: number) {
    if (qty <= 0) {
      setCart(prev => prev.filter(i => !(i.product_id === productId && i.variant_id === variantId)))
    } else {
      setCart(prev => prev.map(item =>
        item.product_id === productId && item.variant_id === variantId
          ? { ...item, quantity: qty }
          : item
      ))
    }
  }

  function removeItem(productId: string, variantId: string | null) {
    setCart(prev => prev.filter(i => !(i.product_id === productId && i.variant_id === variantId)))
  }

  function clearCart() {
    if (cart.length === 0) return
    if (window.confirm('Clear all items from the cart?')) setCart([])
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
        <div className="flex items-center gap-1">
          {cart.length > 0 && (
            <button
              onClick={clearCart}
              title="Clear cart"
              className="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors text-xs font-medium flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
          {onMobileClose && (
            <button onClick={onMobileClose} className="lg:hidden p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          )}
        </div>
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
              <CartRow
                key={`${item.product_id}-${item.variant_id}`}
                item={item}
                onQtyChange={(qty) => updateQty(item.product_id, item.variant_id, qty)}
                onRemove={() => removeItem(item.product_id, item.variant_id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 p-4 space-y-3 shrink-0">
        {loadedBochur && (
          <div className="flex items-center justify-between text-xs py-1">
            <span className="text-slate-500">Balance</span>
            <span className={`font-semibold ${balanceColor}`}>{formatCurrency(loadedBochur.balance)}</span>
          </div>
        )}
        {cart.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Total</span>
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{formatCurrency(subtotal)}</span>
          </div>
        )}
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
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/40 z-30 backdrop-blur-sm" onClick={onMobileClose} />
      )}
      <div
        className={`lg:hidden fixed inset-y-0 right-0 z-40 w-80 max-w-[90vw] shadow-2xl flex flex-col transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {cartBody}
      </div>
      <div className="hidden lg:flex w-72 xl:w-80 border-l border-slate-100 flex-col h-full shrink-0">
        {cartBody}
      </div>
    </>
  )
}

function CartRow({ item, onQtyChange, onRemove }: {
  item: CartItem
  onQtyChange: (qty: number) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState(String(item.quantity))

  function commitEdit() {
    const n = parseInt(inputVal)
    if (!isNaN(n) && n > 0) {
      onQtyChange(n)
    } else if (n === 0) {
      onRemove()
    } else {
      setInputVal(String(item.quantity))
    }
    setEditing(false)
  }

  return (
    <div className="group flex items-center gap-2.5 px-2 py-2.5 rounded-xl hover:bg-slate-50 transition-colors duration-100">
      {/* Icon */}
      {item.icon && (
        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center shrink-0 text-base">
          {item.icon}
        </div>
      )}

      {/* Name + variant */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-slate-800 truncate leading-snug">{item.name}</p>
        {item.variant_label && <p className="text-xs text-slate-400">{item.variant_label}</p>}
        <p className="text-xs font-bold text-amber-600">{formatCurrency(item.price * item.quantity)}</p>
      </div>

      {/* Qty controls */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={() => onQtyChange(item.quantity - 1)}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
        >
          <Minus className="w-3 h-3 text-slate-600" />
        </button>

        {editing ? (
          <input
            type="number"
            className="w-9 text-center text-xs font-bold text-slate-800 bg-amber-50 border border-amber-300 rounded-md focus:outline-none"
            value={inputVal}
            min={0}
            autoFocus
            onChange={e => setInputVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setInputVal(String(item.quantity)); setEditing(false) } }}
          />
        ) : (
          <button
            onClick={() => { setInputVal(String(item.quantity)); setEditing(true) }}
            title="Tap to type quantity"
            className="w-7 text-center text-xs font-bold text-slate-800 hover:bg-amber-50 hover:text-amber-700 rounded-md transition-colors py-1"
          >
            {item.quantity}
          </button>
        )}

        <button
          onClick={() => onQtyChange(item.quantity + 1)}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
        >
          <Plus className="w-3 h-3 text-slate-600" />
        </button>
        <button
          onClick={onRemove}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100 ml-0.5"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
