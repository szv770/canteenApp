'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, X, User, Plus, Minus, Truck, ChefHat } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { BochurWithId } from '@/types/database'
import { upcomingOrderableDates } from '@/lib/preorderCutoff'
import PreorderCalendar from '@/components/PreorderCalendar'
import toast from 'react-hot-toast'

interface Props {
  onClose: () => void
  onSuccess?: () => void
}

interface ItemRow {
  id: string
  name: string
  icon: string | null
  price: number
  staff_pricing_applied: boolean
  preorder_source: 'vendor' | 'in_house'
  remaining_cap: number | null
}

// Cashier-facing counterpart to app/preorder/page.tsx (the public link). Items
// + pricing + daily-cap/"sold out" state are fetched from the exact same
// /api/preorders/public/items endpoint the public link uses (rather than
// re-deriving price/cap client-side from a raw, undated product list) so a
// cashier and a self-service camper/staff member always see the same picture
// for the same bochur+date. Likewise, an existing pending order for the
// selected bochur+date is looked up via /api/preorders/public/my-order and
// edited in place (preorder_id passed through to preorder-place) instead of
// always creating a new row — without this, placing a second preorder for
// someone who already has one pending for that date would silently create a
// duplicate that could get double-charged at "Confirm Received" time.
export default function PreorderModal({ onClose, onSuccess }: Props) {
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BochurWithId[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<BochurWithId | null>(null)
  const debounceRef = useRef<NodeJS.Timeout>()

  const [items, setItems] = useState<ItemRow[]>([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [cutoffTime, setCutoffTime] = useState('20:00')
  const [dates, setDates] = useState<string[]>([])
  const [forDate, setForDate] = useState('')
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({})
  const [existingPreorderId, setExistingPreorderId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Cutoff config — loaded once, independent of which bochur/date gets picked.
  useEffect(() => {
    supabase.from('settings').select('value').eq('key', 'preorder_cutoff_time').single().then(({ data, error }) => {
      if (error) {
        console.error('PreorderModal: failed to load cutoff setting', error)
        toast.error('Could not load ordering settings — try reopening this window')
      }
      const ct = String(data?.value ?? '20:00').replace(/"/g, '')
      setCutoffTime(ct)
      const upcoming = upcomingOrderableDates(ct)
      setDates(upcoming)
      setForDate(upcoming[0] || '')
      if (upcoming.length === 0) setLoadingItems(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Items (with live price/staff-pricing/remaining-cap) + this bochur's
  // existing pending order for the date, re-fetched any time either changes.
  useEffect(() => {
    if (!forDate) return
    // Guard against the bochur/date being changed again before this request
    // resolves — without this, a slow response for a selection the cashier
    // has already moved past could land after (and clobber) the response
    // for what's actually selected now.
    let cancelled = false
    setLoadingItems(true)
    const bochurParam = selected ? `&bochur_id=${selected.id}` : ''
    Promise.all([
      fetch(`/api/preorders/public/items?for_date=${forDate}${bochurParam}`).then(r => r.json()),
      selected
        ? fetch(`/api/preorders/public/my-order?bochur_id=${selected.id}&for_date=${forDate}`).then(r => r.json())
        : Promise.resolve({ order: null }),
    ]).then(([itemsJson, myOrderJson]) => {
      if (cancelled) return
      if (itemsJson.error) {
        console.error('PreorderModal: failed to load preorder items', itemsJson.error)
        toast.error('Could not load preorder items — try reopening this window')
      }
      setItems(itemsJson.items || [])
      const existing = myOrderJson?.order
      if (existing) {
        setExistingPreorderId(existing.id)
        const map: Record<string, number> = {}
        for (const it of existing.preorder_items || []) map[it.product_id] = it.quantity
        setQtyMap(map)
      } else {
        setExistingPreorderId(null)
        setQtyMap({})
      }
      setLoadingItems(false)
    })
    return () => { cancelled = true }
  }, [selected, forDate])

  const search = useCallback((q: string) => {
    clearTimeout(debounceRef.current)
    if (!q.trim()) { setResults([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      const { data, error } = await supabase
        .from('bochurim_with_id')
        .select('*, account_type:account_types(*)')
        .or(`name.ilike.%${q}%,bochur_id.ilike.%${q}%`)
        .eq('archived', false)
        .limit(6)
      if (error) {
        console.error('PreorderModal: bochur search failed', error)
        toast.error('Search failed — try again')
      }
      setResults(data || [])
      setOpen(true)
      setSearching(false)
    }, 220)
  }, [])

  function setQty(productId: string, qty: number) {
    setQtyMap(prev => {
      const next = { ...prev }
      if (qty <= 0) delete next[productId]
      else next[productId] = qty
      return next
    })
  }

  const isStaff = !!selected?.account_type?.is_staff_pricing_tier

  const cartLines = items.filter(i => qtyMap[i.id] > 0).map(i => ({ item: i, qty: qtyMap[i.id] }))
  const total = cartLines.reduce((sum, l) => sum + l.item.price * l.qty, 0)
  const anyStaffPricing = cartLines.some(l => l.item.staff_pricing_applied)

  async function submit() {
    if (!selected) { toast.error('Search and select a bochur'); return }
    if (cartLines.length === 0) { toast.error('Select at least one item'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/pos/preorder-place', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bochur_id: selected.id,
          for_date: forDate,
          items: cartLines.map(l => ({ product_id: l.item.id, quantity: l.qty })),
          preorder_id: existingPreorderId,
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed to place order'); return }
      toast.success(`${existingPreorderId ? 'Preorder updated' : 'Preorder placed'} for ${selected.name} — ${formatCurrency(json.total)} due on pickup`)
      onSuccess ? onSuccess() : onClose()
    } finally {
      setSubmitting(false)
    }
  }

  async function cancelExisting() {
    if (!selected || !existingPreorderId) return
    if (!confirm(`Cancel ${selected.name}'s preorder for ${forDate}?`)) return
    const res = await fetch('/api/preorders/public/cancel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preorder_id: existingPreorderId, bochur_id: selected.id }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error || 'Failed to cancel'); return }
    toast.success('Order cancelled')
    setQtyMap({})
    setExistingPreorderId(null)
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <p className="font-bold text-slate-900 text-lg flex items-center gap-2">
              <Truck className="w-5 h-5 text-amber-500" /> Place Preorder
            </p>
            <p className="text-slate-400 text-sm">Not charged until picked up</p>
          </div>
          <button onClick={onClose} className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Bochur search */}
          <div className="relative">
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">For</label>
            {selected ? (
              <div className="flex items-center justify-between p-3 bg-amber-50 border-2 border-amber-300 rounded-xl">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-amber-600" />
                  <span className="font-semibold text-slate-900">{selected.name}</span>
                  {isStaff && <span className="badge bg-purple-50 text-purple-700 border border-purple-100 text-xs">Staff pricing</span>}
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search by name..."
                    value={query}
                    onChange={e => { setQuery(e.target.value); search(e.target.value) }}
                    onFocus={() => results.length > 0 && setOpen(true)}
                    className="flex-1 text-sm outline-none"
                  />
                  {searching && <div className="w-4 h-4 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin shrink-0" />}
                </div>
                {open && results.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-xl z-10 overflow-hidden">
                    {results.map(b => (
                      <button
                        key={b.id}
                        onMouseDown={() => { setSelected(b); setQuery(''); setOpen(false) }}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 text-left border-b border-slate-50 last:border-0"
                      >
                        <span className="text-sm text-slate-800">{b.name}</span>
                        {b.account_type?.is_staff_pricing_tier && <span className="text-xs text-purple-600">Staff</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">For which day</label>
            <div className="border border-slate-200 rounded-xl p-3">
              <PreorderCalendar cutoffTime={cutoffTime} selected={forDate} onSelect={setForDate} accent="amber" />
            </div>
            {forDate && <p className="text-xs text-slate-400 mt-1.5">Ordering for {forDate}</p>}
            {dates.length === 0 && <p className="text-xs text-red-500 mt-1">No dates currently open — cutoff is {cutoffTime} the evening before.</p>}
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-semibold text-slate-700">Items</label>
              {existingPreorderId && <span className="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">Editing existing order</span>}
            </div>
            {loadingItems ? (
              <p className="text-sm text-slate-400">Loading...</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-slate-400">No items are currently orderable — enable "Orderable via Preorders" on a product.</p>
            ) : (
              <div className="space-y-2">
                {items.map(p => {
                  const qty = qtyMap[p.id] || 0
                  const soldOut = p.remaining_cap != null && p.remaining_cap <= 0 && qty === 0
                  return (
                    <div key={p.id} className={`flex items-center justify-between p-2.5 border rounded-xl ${soldOut ? 'border-slate-100 opacity-50' : 'border-slate-100'}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {p.preorder_source === 'vendor' ? <Truck className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChefHat className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                          <span className="text-sm text-slate-800 truncate">{p.icon} {p.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-slate-500">{formatCurrency(p.price)}</span>
                          {p.staff_pricing_applied && <span className="text-xs text-purple-600">Staff discount applied</span>}
                          {soldOut && <span className="text-xs text-red-500">Sold out for this date</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button disabled={soldOut} onClick={() => setQty(p.id, Math.max(0, qty - 1))} className="w-7 h-7 flex items-center justify-center bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40"><Minus className="w-3.5 h-3.5" /></button>
                        <span className="w-6 text-center text-sm font-semibold">{qty}</span>
                        <button disabled={soldOut} onClick={() => setQty(p.id, qty + 1)} className="w-7 h-7 flex items-center justify-center bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40"><Plus className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {cartLines.length > 0 && (
            <div className="p-3.5 bg-amber-50 border border-amber-100 rounded-xl">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Total due on pickup</span>
                <span className="font-bold text-slate-900 text-lg">{formatCurrency(total)}</span>
              </div>
              {anyStaffPricing && <p className="text-xs text-purple-600 mt-0.5">Staff discount applied</p>}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 p-4 shrink-0 space-y-2">
          <button
            onClick={submit}
            disabled={submitting || !selected || cartLines.length === 0 || !forDate}
            className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-xl transition-colors"
          >
            {submitting ? 'Placing...' : existingPreorderId ? 'Update Preorder' : 'Place Preorder'}
          </button>
          {existingPreorderId && (
            <button onClick={cancelExisting} className="w-full py-2 text-red-600 text-sm font-medium hover:underline">
              Cancel this order
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
