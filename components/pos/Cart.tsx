'use client'

import { useEffect, useRef, useState } from 'react'
import { ShoppingCart, Trash2, Plus, Minus, X, Zap, Sparkles } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { CartItem, BochurWithId, Product } from '@/types/database'

interface Props {
  cart: CartItem[]
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>
  loadedBochur: BochurWithId | null
  settings: Record<string, string>
  onCheckout: () => void
  onQuickCharge?: () => void
  quickCharging?: boolean
  mobileOpen?: boolean
  onMobileClose?: () => void
  upsellProduct?: Product | null
  onAddUpsell?: () => void
  onDismissUpsell?: () => void
  sederActive?: boolean
  sederName?: string
}

const SEDER_ARM_TIMEOUT_MS = 5000

export default function CartPanel({ cart, setCart, loadedBochur, settings, onCheckout, onQuickCharge, quickCharging, mobileOpen, onMobileClose, upsellProduct, onAddUpsell, onDismissUpsell, sederActive, sederName }: Props) {
  const [sederArmed, setSederArmed] = useState(false)
  const armTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    setSederArmed(false)
  }, [cart, loadedBochur, sederActive])

  function handleQuickChargeClick() {
    if (!onQuickCharge) return
    if (sederActive && !sederArmed) {
      setSederArmed(true)
      clearTimeout(armTimeoutRef.current)
      armTimeoutRef.current = setTimeout(() => setSederArmed(false), SEDER_ARM_TIMEOUT_MS)
      return
    }
    setSederArmed(false)
    onQuickCharge()
  }

  function updateQtyByIndex(index: number, qty: number) {
    if (qty <= 0) {
      setCart(prev => prev.filter((_, i) => i !== index))
    } else {
      setCart(prev => prev.map((item, i) => i === index ? { ...item, quantity: qty } : item))
    }
  }

  function removeItemByIndex(index: number) {
    setCart(prev => prev.filter((_, i) => i !== index))
  }

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

  const subtotal = cart.reduce((sum, i) => sum + (i.price + (i.addon_total || 0)) * i.quantity, 0)
  const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0)
  const balanceColor = loadedBochur
    ? (loadedBochur.balance >= subtotal ? 'text-emerald-600' : 'text-red-500')
    : 'text-slate-500'

  const frozen = loadedBochur?.is_frozen ?? false
  const allowNegative = loadedBochur?.allow_negative ?? false
  const maxNeg = loadedBochur?.max_negative_balance ?? 0
  const balanceAfterCharge = loadedBochur ? Math.round((loadedBochur.balance - subtotal) * 100) / 100 : 0
  const blocked = !!loadedBochur && balanceAfterCharge < 0 && (!allowNegative || -balanceAfterCharge > maxNeg)

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
            {cart.map((item, idx) => (
              <CartRow
                key={`${item.product_id}-${item.variant_id}-${idx}`}
                item={item}
                onQtyChange={(qty) => updateQtyByIndex(idx, qty)}
                onRemove={() => removeItemByIndex(idx)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Frequently-bought-together suggestion */}
      {upsellProduct && onAddUpsell && onDismissUpsell && (
        <div className="mx-3 mb-2 shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
          {upsellProduct.icon && <span className="text-lg shrink-0">{upsellProduct.icon}</span>}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-amber-600 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Goes with this order
            </p>
            <p className="text-sm font-semibold text-slate-800 truncate">{upsellProduct.name}</p>
          </div>
          <button
            onClick={onAddUpsell}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors"
          >
            + Add
          </button>
          <button
            onClick={onDismissUpsell}
            className="shrink-0 p-1 rounded-lg text-amber-400 hover:bg-amber-100 hover:text-amber-600 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
        {loadedBochur && onQuickCharge && cart.length > 0 && (
          <>
            {frozen && (
              <p className="text-xs font-medium text-red-500 text-center">This account is frozen and cannot be charged.</p>
            )}
            {!frozen && blocked && (
              <p className="text-xs font-medium text-red-500 text-center">Charge would exceed the account&apos;s negative balance limit — use cash or card instead.</p>
            )}
            {sederActive && !sederArmed && (
              <p className="text-xs font-medium text-red-500 text-center">{sederName} is in session — tap again to confirm.</p>
            )}
            <button
              onClick={handleQuickChargeClick}
              disabled={quickCharging || frozen || blocked}
              className={`w-full min-h-[52px] rounded-xl text-white font-semibold text-base flex items-center justify-center gap-2 transition-colors shadow-sm ${
                frozen || blocked
                  ? 'bg-slate-200 text-slate-400'
                  : sederActive && !sederArmed
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-emerald-500 hover:bg-emerald-600 disabled:opacity-75'
              }`}
            >
              {quickCharging ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Charging...
                </>
              ) : sederActive && !sederArmed ? (
                <>Seder in session — Order Anyway?</>
              ) : sederActive ? (
                <>Confirm — Charge {formatCurrency(subtotal)}</>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  Charge to Account · {formatCurrency(subtotal)}
                </>
              )}
            </button>
          </>
        )}
        <button
          onClick={onCheckout}
          disabled={cart.length === 0}
          className="btn-brand-lg"
        >
          {cart.length === 0 ? 'Add items to charge' : (loadedBochur ? `Other Payment · ${formatCurrency(subtotal)}` : `Charge ${formatCurrency(subtotal)}`)}
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
        {item.addon_names && item.addon_names.length > 0 && (
          <p className="text-xs text-slate-400">+ {item.addon_names.join(', ')}</p>
        )}
        <p className="text-xs font-bold text-amber-600">{formatCurrency((item.price + (item.addon_total || 0)) * item.quantity)}</p>
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
