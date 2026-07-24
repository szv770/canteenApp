'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Search, User, Plus, Minus, Check, X, Truck, ChefHat } from 'lucide-react'
import toast from 'react-hot-toast'
import PreorderCalendar from '@/components/PreorderCalendar'

interface SearchResult { id: string; name: string; is_staff: boolean }
interface ItemRow { id: string; name: string; icon: string | null; image_url: string | null; price: number; staff_pricing_applied: boolean; preorder_source: 'vendor' | 'in_house'; remaining_cap: number | null }

const INPUT_CLS = 'w-full px-3 py-2.5 bg-white border border-stone-200 rounded-xl text-base text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-600/25 focus:border-teal-600 transition-all min-h-[44px]'

function money(n: number) {
  return `$${n.toFixed(2)}`
}

export default function PreorderPage() {
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [enabled, setEnabled] = useState(true)
  const [dates, setDates] = useState<string[]>([])
  const [cutoffTime, setCutoffTime] = useState('20:00')

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const debounceRef = useRef<NodeJS.Timeout>()

  const [forDate, setForDate] = useState('')
  const [items, setItems] = useState<ItemRow[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({})
  const [existingPreorderId, setExistingPreorderId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<{ total: number; staffPricing: boolean } | null>(null)

  useEffect(() => {
    fetch('/api/preorders/public/config').then(r => r.json()).then(json => {
      setEnabled(json.enabled)
      setDates(json.dates || [])
      setCutoffTime(json.cutoff_time || '20:00')
      setForDate(json.dates?.[0] || '')
      setLoadingConfig(false)
    })
  }, [])

  const search = useCallback((q: string) => {
    clearTimeout(debounceRef.current)
    if (q.trim().length < 2) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      const res = await fetch(`/api/preorders/public/search?q=${encodeURIComponent(q.trim())}`)
      const json = await res.json()
      setResults(json.results || [])
      setSearching(false)
    }, 250)
  }, [])

  useEffect(() => {
    if (!selected || !forDate) return
    setLoadingItems(true)
    setDone(null)
    Promise.all([
      fetch(`/api/preorders/public/items?bochur_id=${selected.id}&for_date=${forDate}`).then(r => r.json()),
      fetch(`/api/preorders/public/my-order?bochur_id=${selected.id}&for_date=${forDate}`).then(r => r.json()),
    ]).then(([itemsJson, myOrderJson]) => {
      if (itemsJson.error) {
        console.error('Failed to load preorder items:', itemsJson.error)
        toast.error('Could not load items — please refresh and try again')
      }
      setItems(itemsJson.items || [])
      const existing = myOrderJson.order
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
  }, [selected, forDate])

  function setQty(id: string, qty: number) {
    setQtyMap(prev => {
      const next = { ...prev }
      if (qty <= 0) delete next[id]
      else next[id] = qty
      return next
    })
  }

  const cartLines = items.filter(i => qtyMap[i.id] > 0).map(i => ({ item: i, qty: qtyMap[i.id] }))
  const total = cartLines.reduce((sum, l) => sum + l.item.price * l.qty, 0)
  const anyStaffPricing = cartLines.some(l => l.item.staff_pricing_applied)

  async function submit() {
    if (!selected || cartLines.length === 0) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/preorders/public/place', {
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
      setDone({ total: json.total, staffPricing: json.staff_pricing_applied })
      setExistingPreorderId(json.preorder_id)
    } finally {
      setSubmitting(false)
    }
  }

  async function cancelOrder() {
    if (!selected || !existingPreorderId) return
    if (!confirm('Cancel this order?')) return
    const res = await fetch('/api/preorders/public/cancel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preorder_id: existingPreorderId, bochur_id: selected.id }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error || 'Failed to cancel'); return }
    toast.success('Order cancelled')
    setQtyMap({})
    setExistingPreorderId(null)
    setDone(null)
  }

  if (loadingConfig) {
    return <div className="min-h-screen bg-stone-50 flex items-center justify-center text-stone-400">Loading...</div>
  }

  if (!enabled) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6 text-center">
        <p className="text-stone-500">Online ordering isn't available right now — please check with the canteen directly.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-6 sm:py-10">
      <div className="max-w-md mx-auto space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-stone-900">Order Ahead</h1>
          <p className="text-stone-500 text-sm">Vendor & made-to-order items — nothing is charged until you pick it up.</p>
        </div>

        {/* Step 1: who */}
        <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-2">
          <label className="text-sm font-semibold text-stone-700">Your name</label>
          {selected ? (
            <div className="flex items-center justify-between p-3 bg-teal-50 border-2 border-teal-200 rounded-xl">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-teal-700" />
                <span className="font-semibold text-stone-900">{selected.name}</span>
              </div>
              <button onClick={() => { setSelected(null); setDone(null) }} className="text-stone-400 hover:text-stone-600 p-1"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <div className="relative">
              <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-3 py-2.5">
                <Search className="w-4 h-4 text-stone-400 shrink-0" />
                <input
                  type="text" placeholder="Type your name..."
                  value={query}
                  onChange={e => { setQuery(e.target.value); search(e.target.value) }}
                  className="flex-1 text-base outline-none"
                />
                {searching && <div className="w-4 h-4 border-2 border-teal-600/30 border-t-teal-600 rounded-full animate-spin shrink-0" />}
              </div>
              {results.length > 0 && (
                <div className="mt-1.5 border border-stone-200 rounded-xl overflow-hidden shadow-sm">
                  {results.map(r => (
                    <button key={r.id} onClick={() => { setSelected(r); setQuery(''); setResults([]) }}
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-stone-50 text-left border-b border-stone-100 last:border-0 min-h-[44px]">
                      <span className="text-sm text-stone-800">{r.name}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-stone-400 mt-1.5">Don't see your name? Ask the canteen to set up your account first.</p>
            </div>
          )}
        </div>

        {selected && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-2">
            <label className="text-sm font-semibold text-stone-700">For which day</label>
            <PreorderCalendar cutoffTime={cutoffTime} selected={forDate} onSelect={setForDate} accent="teal" />
            {dates.length === 0 && (
              <p className="text-sm text-red-500">Ordering is closed for all upcoming dates right now.</p>
            )}
          </div>
        )}

        {selected && forDate && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-stone-700">Items</label>
              {existingPreorderId && <span className="text-xs text-teal-700 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-full">Editing your order</span>}
            </div>
            {loadingItems ? (
              <p className="text-sm text-stone-400">Loading...</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-stone-400">Nothing is orderable for this date right now.</p>
            ) : (
              <div className="space-y-2">
                {items.map(it => {
                  const qty = qtyMap[it.id] || 0
                  const soldOut = it.remaining_cap != null && it.remaining_cap <= 0 && qty === 0
                  return (
                    <div key={it.id} className={`flex items-center justify-between p-2.5 border rounded-xl ${soldOut ? 'border-stone-100 opacity-50' : 'border-stone-100'}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {it.preorder_source === 'vendor' ? <Truck className="w-3.5 h-3.5 text-stone-400 shrink-0" /> : <ChefHat className="w-3.5 h-3.5 text-stone-400 shrink-0" />}
                          <span className="text-sm font-medium text-stone-800 truncate">{it.icon} {it.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-stone-500">{money(it.price)}</span>
                          {it.staff_pricing_applied && <span className="text-xs text-purple-600">Staff discount applied</span>}
                          {soldOut && <span className="text-xs text-red-500">Sold out for this date</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button disabled={soldOut} onClick={() => setQty(it.id, Math.max(0, qty - 1))} className="w-8 h-8 flex items-center justify-center bg-stone-100 rounded-lg disabled:opacity-40"><Minus className="w-4 h-4" /></button>
                        <span className="w-6 text-center text-sm font-semibold">{qty}</span>
                        <button disabled={soldOut} onClick={() => setQty(it.id, qty + 1)} className="w-8 h-8 flex items-center justify-center bg-stone-100 rounded-lg disabled:opacity-40"><Plus className="w-4 h-4" /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {cartLines.length > 0 && (
              <div className="p-3 bg-teal-50 border border-teal-100 rounded-xl flex items-center justify-between">
                <span className="text-sm text-stone-600">Total due on pickup</span>
                <span className="font-bold text-stone-900 text-lg">{money(total)}</span>
              </div>
            )}

            <button
              onClick={submit}
              disabled={submitting || cartLines.length === 0}
              className="w-full py-3 bg-orange-700 hover:bg-orange-800 disabled:bg-stone-200 disabled:text-stone-400 text-white font-semibold rounded-xl transition-colors min-h-[44px]"
            >
              {submitting ? 'Placing...' : existingPreorderId ? 'Update Order' : 'Place Order'}
            </button>

            {existingPreorderId && (
              <button onClick={cancelOrder} className="w-full py-2.5 text-red-600 text-sm font-medium hover:underline">
                Cancel my order
              </button>
            )}
          </div>
        )}

        {done && (
          <div className="bg-white rounded-2xl border-2 border-emerald-200 p-5 text-center space-y-2">
            <Check className="w-8 h-8 text-emerald-500 mx-auto" />
            <p className="font-bold text-stone-900">Order placed!</p>
            <p className="text-sm text-stone-500">{money(done.total)} due when you pick it up. You can come back to this page to change or cancel it before ordering closes.</p>
          </div>
        )}
      </div>
    </div>
  )
}
