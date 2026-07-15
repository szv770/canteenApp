'use client'

import { useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, X, User, DollarSign, Clock, Mail, ExternalLink, Check } from 'lucide-react'
import { formatCurrency, calcCCFee } from '@/lib/utils'
import type { BochurWithId } from '@/types/database'
import toast from 'react-hot-toast'

interface Props {
  onClose: () => void
  onSuccess?: () => void
  settings: Record<string, string>
}

const METHODS = ['cash', 'zelle', 'venmo', 'paypal', 'cashapp', 'credit_card', 'manual'] as const
type Method = typeof METHODS[number]

const METHOD_LABELS: Record<Method, string> = {
  cash: 'Cash',
  zelle: 'Zelle',
  venmo: 'Venmo',
  paypal: 'PayPal',
  cashapp: 'Cash App',
  credit_card: 'Credit Card',
  manual: 'Manual',
}

export default function TopUpModal({ onClose, onSuccess, settings }: Props) {
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BochurWithId[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<BochurWithId | null>(null)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<Method>('cash')
  const [note, setNote] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [stripeOpened, setStripeOpened] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout>()

  const parsedAmount = parseFloat(amount) || 0
  const ccFeePercent = parseFloat(settings['cc_fee_percent'] || '3')
  const ccFee = method === 'credit_card' && parsedAmount > 0 ? calcCCFee(parsedAmount, ccFeePercent) : 0
  const ccTotalToCharge = parsedAmount + ccFee
  const ccLinkRaw = settings['payment_cc_link']
  const stripeUrl = ccLinkRaw ? (/^https?:\/\//i.test(ccLinkRaw) ? ccLinkRaw : `https://${ccLinkRaw}`) : null

  const search = useCallback((q: string) => {
    clearTimeout(debounceRef.current)
    if (!q.trim()) { setResults([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from('bochurim_with_id')
        .select('*, account_type:account_types(*)')
        .or(`name.ilike.%${q}%,bochur_id.ilike.%${q}%`)
        .eq('archived', false)
        .limit(6)
      setResults(data || [])
      setOpen(true)
      setSearching(false)
    }, 220)
  }, [])

  async function submit() {
    if (submitting) return
    if (!selected) { toast.error('Select a bochur first'); return }
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt < 0.01) { toast.error('Enter a valid amount'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/pos/cashier-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bochur_id: selected.id,
          student_name: selected.name,
          amount: amt,
          method,
          note: note.trim() || null,
          parent_email: parentEmail.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to submit')

      toast.success(
        json.auto_approved
          ? `$${amt.toFixed(2)} added to balance instantly!`
          : `Top-up request submitted — pending admin approval`,
        { duration: 4000 }
      )
      onSuccess?.()
      onClose()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit top-up request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md animate-scale-in max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0">
          <h2 className="font-bold text-slate-900">Top Up Account</h2>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-slate-100 rounded-xl">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Bochur selection */}
          {selected ? (
            <div className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-3 py-2">
              <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-amber-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900 text-sm truncate">{selected.name}</div>
                <span className="text-xs text-slate-500">Balance: {formatCurrency(selected.balance)}</span>
              </div>
              <button onClick={() => { setSelected(null); setQuery('') }} className="shrink-0 p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-amber-400/40 focus-within:border-amber-400">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search bochur by name or ID..."
                  value={query}
                  onChange={e => { setQuery(e.target.value); search(e.target.value) }}
                  onFocus={() => results.length > 0 && setOpen(true)}
                  onBlur={() => setTimeout(() => setOpen(false), 150)}
                  className="flex-1 text-base text-slate-900 placeholder-slate-400 bg-transparent outline-none"
                />
                {searching && <div className="w-4 h-4 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin shrink-0" />}
              </div>
              {open && results.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-100 rounded-xl shadow-xl z-50 overflow-hidden">
                  {results.map(b => (
                    <button
                      key={b.id}
                      onMouseDown={() => { setSelected(b); setQuery(''); setOpen(false) }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 text-left border-b border-slate-50 last:border-0"
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
                      <span className="text-sm font-bold shrink-0 text-emerald-600">{formatCurrency(b.balance)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Amount</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
              />
            </div>
          </div>

          {/* Method */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Method</label>
            <div className="grid grid-cols-4 gap-2">
              {METHODS.map(m => (
                <button
                  key={m}
                  onClick={() => { setMethod(m); setStripeOpened(false) }}
                  className={`py-2 rounded-xl text-xs font-medium transition-all ${
                    method === m
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {METHOD_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {/* Credit card — fee math + Stripe hand-off, mirrors CheckoutModal's CC tab */}
          {method === 'credit_card' && parsedAmount > 0 && (
            <div className="space-y-3">
              <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Top-up amount (credited)</span>
                  <span className="text-slate-900 font-medium">{formatCurrency(parsedAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Card fee ({ccFeePercent}%)</span>
                  <span className="text-slate-900 font-medium">{formatCurrency(ccFee)}</span>
                </div>
                <div className="border-t border-slate-200 pt-1.5 flex justify-between">
                  <span className="font-semibold text-slate-700">Total to charge on Stripe</span>
                  <span className="font-bold text-slate-900">{formatCurrency(ccTotalToCharge)}</span>
                </div>
              </div>
              {stripeUrl ? (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-center space-y-3">
                  <p className="text-2xl font-bold text-blue-800">{formatCurrency(ccTotalToCharge)}</p>
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
                      ? 'Once the card is charged, submit the request below.'
                      : 'Opens Stripe in a new tab — come back here once the card is charged.'}
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
                  No Stripe link configured — ask an admin to set one in Settings, or run the card manually and note it below.
                </div>
              )}
            </div>
          )}

          {/* Parent email — optional, enables email notifications for this top-up */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Parent Email (optional)</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                placeholder="parent@email.com — sends confirmation emails"
                value={parentEmail}
                onChange={e => setParentEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
              />
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Notes (optional)</label>
            <input
              type="text"
              placeholder="Reference / note..."
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
            />
          </div>

          <div className="flex items-start gap-2 text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
            <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <span>Requires admin approval before balance is added. Check <strong>Top-ups</strong> in the admin panel.</span>
          </div>

          <button
            onClick={submit}
            disabled={submitting || !selected || !amount}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : selected && amount ? `Request ${formatCurrency(parseFloat(amount) || 0)} Top-up` : 'Submit Top-up Request'}
          </button>
        </div>
      </div>
    </div>
  )
}
