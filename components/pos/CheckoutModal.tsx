'use client'

import { useState, useCallback, useRef } from 'react'
import { X, DollarSign, CreditCard, Wallet, Check, Search, User, UserPlus, ExternalLink } from 'lucide-react'
import { formatCurrency, roundCash, calcCCFee, applyDiscount } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
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

export default function CheckoutModal({ cart, loadedBochur: initialBochur, settings, cashierName, onClose, onSuccess }: Props) {
  const [selectedBochur, setSelectedBochur] = useState<BochurWithId | null>(initialBochur)
  const [method, setMethod] = useState<PayMethod>(initialBochur ? 'balance' : 'cash')
  const [linkDismissed, setLinkDismissed] = useState(false)
  const [stripeOpened, setStripeOpened] = useState(false)

  // Inline camper linking (only when checkout opened without a loaded bochur)
  const supabaseRef = useRef(createClient())
  const [linkQuery, setLinkQuery] = useState('')
  const [linkResults, setLinkResults] = useState<BochurWithId[]>([])
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const linkDebounce = useRef<NodeJS.Timeout>()

  const searchBochurim = useCallback((q: string) => {
    clearTimeout(linkDebounce.current)
    if (!q.trim()) { setLinkResults([]); setLinkOpen(false); return }
    linkDebounce.current = setTimeout(async () => {
      setLinkLoading(true)
      const { data } = await supabaseRef.current
        .from('bochurim_with_id')
        .select('*, account_type:account_types(*)')
        .or(`name.ilike.%${q}%,bochur_id.ilike.%${q}%`)
        .eq('archived', false)
        .limit(6)
      setLinkResults(data || [])
      setLinkOpen(true)
      setLinkLoading(false)
    }, 220)
  }, [])

  function selectBochur(b: BochurWithId) {
    setSelectedBochur(b)
    setMethod('balance')
    setLinkQuery('')
    setLinkResults([])
    setLinkOpen(false)
  }
  const [cashTendered, setCashTendered] = useState('')
  const [changeToBalance, setChangeToBalance] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [discountCodeInput, setDiscountCodeInput] = useState('')
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; amount: number; description: string } | null>(null)
  const [discountError, setDiscountError] = useState('')
  const [applyingDiscount, setApplyingDiscount] = useState(false)
  const [tipAmount, setTipAmount] = useState(0)
  const [customTip, setCustomTip] = useState('')

  const QUICK_TIPS = [0.25, 0.5, 1, 2]

  const coinRounding = settings['coin_rounding'] === 'true'
  const ccFeePercent = parseFloat(settings['cc_fee_percent'] || '3')

  const rawSubtotal = cart.reduce((sum, i) => sum + (i.price + (i.addon_total || 0)) * i.quantity, 0)

  // Estimate account type discount for display (actual calculation is server-side)
  const atDiscountType = selectedBochur?.account_type?.discount_type
  const atDiscount = (() => {
    const at = selectedBochur?.account_type
    if (!at || at.discount_type === 'none' || !at.discount_value) return 0
    if (at.discount_type === 'percentage') {
      return Math.round(rawSubtotal * (at.discount_value / 100) * 100) / 100
    }
    if (at.discount_type === 'fixed') {
      return Math.min(rawSubtotal, at.discount_value)
    }
    // cost_price: server applies it; we can't estimate client-side without product costs
    return 0
  })()

  const discountAmount = appliedDiscount?.amount ?? 0
  const subtotalAfterDiscount = Math.max(0, Math.round((rawSubtotal - discountAmount) * 100) / 100)
  const subtotal = coinRounding && method === 'cash' ? roundCash(subtotalAfterDiscount) : subtotalAfterDiscount
  const ccFee = method === 'credit_card' ? calcCCFee(subtotalAfterDiscount, ccFeePercent) : 0
  const total = subtotalAfterDiscount + ccFee
  const grandTotal = Math.round((total + tipAmount) * 100) / 100
  const displayTotal = coinRounding && method === 'cash' ? Math.round((roundCash(subtotalAfterDiscount) + tipAmount) * 100) / 100 : grandTotal

  const tendered = parseFloat(cashTendered) || 0
  const change = Math.max(0, Math.round((tendered - displayTotal) * 100) / 100)

  // Real <a href target="_blank"> — more reliable than window.open() on locked-down
  // kiosk browsers, which can silently swallow script-triggered popups.
  const ccLinkRaw = settings['payment_cc_link']
  const stripeUrl = ccLinkRaw ? (/^https?:\/\//i.test(ccLinkRaw) ? ccLinkRaw : `https://${ccLinkRaw}`) : null

  const balanceAfter = selectedBochur ? Math.round((selectedBochur.balance - subtotalAfterDiscount - tipAmount) * 100) / 100 : 0
  const insufficientBalance = selectedBochur && selectedBochur.balance < (subtotalAfterDiscount + tipAmount)
  const allowNegative = selectedBochur?.allow_negative ?? false
  const maxNeg = selectedBochur?.max_negative_balance ?? 0
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
      const res = await fetch('/api/pos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method,
          bochur_id: selectedBochur?.id ?? null,
          cash_tendered: method === 'cash' ? tendered : null,
          change_to_balance: method === 'cash' && changeToBalance && change > 0 && selectedBochur ? change : undefined,
          discount_code: appliedDiscount?.code ?? null,
          tip_amount: tipAmount > 0 ? tipAmount : undefined,
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
    ...(selectedBochur ? [{ id: 'balance' as PayMethod, label: 'Balance', icon: <Wallet className="w-4 h-4" /> }] : []),
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
          {/* Link camper prompt — only when opened without a loaded bochur */}
          {!initialBochur && (
            selectedBochur ? (
              <div className="px-4 sm:px-5 py-3 border-b border-pos-border">
                <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 text-sm truncate">{selectedBochur.name}</p>
                    <p className={`text-xs font-bold ${selectedBochur.balance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {formatCurrency(selectedBochur.balance)}
                    </p>
                  </div>
                  <button
                    onClick={() => { setSelectedBochur(null); setMethod('cash') }}
                    className="shrink-0 p-1 hover:bg-white rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              </div>
            ) : !linkDismissed ? (
              <div className="px-4 sm:px-5 py-3 border-b border-pos-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4 text-slate-400" />
                    Link to a camper?
                  </span>
                  <button
                    onClick={() => setLinkDismissed(true)}
                    className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Skip — No Account
                  </button>
                </div>
                <div className="relative">
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-amber-400/40 focus-within:border-amber-400 transition-all">
                    <Search className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="Search by name or ID..."
                      value={linkQuery}
                      onChange={e => { setLinkQuery(e.target.value); searchBochurim(e.target.value) }}
                      onFocus={() => linkResults.length > 0 && setLinkOpen(true)}
                      onBlur={() => setTimeout(() => setLinkOpen(false), 150)}
                      className="flex-1 text-base text-slate-900 placeholder-slate-400 bg-transparent outline-none"
                    />
                    {linkLoading && <div className="w-4 h-4 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin shrink-0" />}
                  </div>
                  {linkOpen && linkResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-100 rounded-xl shadow-xl z-50 overflow-hidden">
                      {linkResults.map(b => (
                        <button
                          key={b.id}
                          onMouseDown={() => selectBochur(b)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left border-b border-slate-50 last:border-0"
                        >
                          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-amber-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-900 text-sm">{b.name}</span>
                              <span className="text-slate-400 text-xs">{b.bochur_id}</span>
                            </div>
                          </div>
                          <span className={`text-sm font-bold shrink-0 ${b.balance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(b.balance)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null
          )}

          {/* Order summary */}
          <div className="px-4 sm:px-5 py-3 border-b border-pos-border max-h-32 overflow-y-auto">
            {cart.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm py-0.5 gap-2">
                <div className="min-w-0">
                  <span className="text-pos-text">
                    {item.quantity}× {item.name}{item.variant_label ? ` (${item.variant_label})` : ''}
                  </span>
                  {item.addon_names && item.addon_names.length > 0 && (
                    <p className="text-pos-muted text-xs leading-tight">+ {item.addon_names.join(', ')}</p>
                  )}
                </div>
                <span className="text-pos-subtext font-medium shrink-0">{formatCurrency((item.price + (item.addon_total || 0)) * item.quantity)}</span>
              </div>
            ))}
          </div>

          {/* Tip section */}
          <div className="px-4 sm:px-5 py-2.5 border-b border-pos-border">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-pos-subtext">Tip</span>
              {tipAmount > 0 && <span className="text-xs text-amber-600 font-medium">{formatCurrency(tipAmount)} added</span>}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => { setTipAmount(0); setCustomTip('') }}
                className={`flex-1 min-w-[48px] py-2 rounded-lg text-xs font-medium border transition-colors ${tipAmount === 0 && !customTip ? 'bg-slate-700 text-white border-slate-700' : 'border-slate-200 text-slate-500 hover:border-slate-400'}`}
              >
                None
              </button>
              {QUICK_TIPS.map(amt => (
                <button
                  key={amt}
                  onClick={() => { setTipAmount(amt); setCustomTip('') }}
                  className={`flex-1 min-w-[48px] py-2 rounded-lg text-xs font-medium border transition-colors ${tipAmount === amt && !customTip ? 'bg-amber-500 text-white border-amber-500' : 'border-slate-200 text-slate-500 hover:border-amber-300'}`}
                >
                  +{formatCurrency(amt)}
                </button>
              ))}
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.25}
                placeholder="Custom"
                value={customTip}
                onChange={e => { setCustomTip(e.target.value); setTipAmount(parseFloat(e.target.value) || 0) }}
                className="flex-1 min-w-[64px] px-2 py-2 rounded-lg text-xs border border-slate-200 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
              />
            </div>
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
            {method === 'balance' && selectedBochur && (
              <div className="space-y-3 mb-4">
                <div className="bg-pos-bg rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-pos-subtext">Subtotal</span>
                    <span className="font-semibold text-pos-text">{formatCurrency(rawSubtotal)}</span>
                  </div>
                  {selectedBochur.account_type && atDiscountType && atDiscountType !== 'none' && (
                    <div className="flex justify-between text-sm">
                      <span className="text-blue-600 font-medium">
                        🏷️ {selectedBochur.account_type.name}
                        {atDiscountType === 'percentage'
                          ? ` (${selectedBochur.account_type.discount_value}% off)`
                          : atDiscountType === 'fixed'
                          ? ` (-$${selectedBochur.account_type.discount_value} off)`
                          : ' (at cost price)'}
                      </span>
                      {atDiscount > 0
                        ? <span className="font-semibold text-blue-600">-{formatCurrency(atDiscount)}</span>
                        : <span className="text-xs text-blue-500 italic">applied at checkout</span>
                      }
                    </div>
                  )}
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-emerald-600 font-medium">🎟️ Coupon ({appliedDiscount?.code})</span>
                      <span className="font-semibold text-emerald-600">-{formatCurrency(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-pos-subtext">Current balance</span>
                    <span className="font-semibold text-pos-text">{formatCurrency(selectedBochur.balance)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-pos-subtext">This order</span>
                    <span className="font-semibold text-red-500">-{formatCurrency(subtotalAfterDiscount)}</span>
                  </div>
                  {tipAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-pos-subtext">Tip</span>
                      <span className="font-semibold text-amber-600">-{formatCurrency(tipAmount)}</span>
                    </div>
                  )}
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
                  <span className="text-pos-subtext">Amount due{tipAmount > 0 ? ` (incl. ${formatCurrency(tipAmount)} tip)` : ''}</span>
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
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {QUICK_CASH.map(amt => (
                    <button
                      key={amt}
                      onClick={() => setCashTendered(String(amt))}
                      className="py-2.5 min-h-[44px] bg-pos-bg hover:bg-pos-hover border border-pos-border rounded-xl text-sm font-medium text-pos-text transition-colors"
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
                {tendered >= displayTotal && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <span className="text-emerald-700 font-medium text-sm">Change due</span>
                      <span className="text-emerald-700 font-bold text-xl">{formatCurrency(change)}</span>
                    </div>
                    {change > 0 && selectedBochur && (
                      <button
                        onClick={() => setChangeToBalance(v => !v)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                          changeToBalance
                            ? 'bg-blue-50 border-blue-300 text-blue-800'
                            : 'bg-pos-bg border-pos-border text-pos-subtext hover:text-pos-text'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                          changeToBalance ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
                        }`}>
                          {changeToBalance && <span className="text-white text-xs font-bold">✓</span>}
                        </span>
                        <span>
                          Add <span className="font-bold">{formatCurrency(change)}</span> change to{' '}
                          <span className="font-bold">{selectedBochur.name.split(' ')[0]}</span>&apos;s balance
                        </span>
                      </button>
                    )}
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
                {stripeUrl ? (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-center space-y-3">
                    <p className="text-2xl font-bold text-blue-800">{formatCurrency(total)}</p>
                    <p className="text-xs text-blue-600">Type this amount in on the Stripe payment page</p>
                    <a
                      href={stripeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setStripeOpened(true)}
                      className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-all ${
                        stripeOpened
                          ? 'bg-emerald-500 text-white'
                          : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
                      }`}
                    >
                      {stripeOpened ? (
                        <><Check className="w-4 h-4" /> Stripe Opened ✓</>
                      ) : (
                        <><ExternalLink className="w-4 h-4" /> Open Stripe to Charge</>
                      )}
                    </a>
                    <p className="text-xs text-blue-500">
                      {stripeOpened
                        ? 'Once payment is confirmed in Stripe, tap Complete Order below.'
                        : 'Opens Stripe in a new tab — come back here once the card is charged.'}
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-center space-y-1">
                    <p className="text-xs text-blue-600 uppercase font-semibold tracking-wide">Charge on card reader</p>
                    <p className="text-2xl font-bold text-blue-800">{formatCurrency(total)}</p>
                    <p className="text-xs text-blue-500">Enter this amount on your card reader, then tap Complete Order</p>
                  </div>
                )}
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
              <span className="flex flex-col items-center justify-center leading-tight">
                <span className="flex items-center gap-2 font-semibold">
                  <Check className="w-5 h-5" />
                  Complete Order · {formatCurrency(method === 'credit_card' ? grandTotal : displayTotal)}
                </span>
                {tipAmount > 0 && <span className="text-white/70 text-xs mt-0.5">includes {formatCurrency(tipAmount)} tip</span>}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
