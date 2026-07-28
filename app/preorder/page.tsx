'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Search, User, Plus, Minus, Check, X, Pin, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import PreorderCalendar from '@/components/PreorderCalendar'
import PreorderCutoffCountdown from '@/components/PreorderCutoffCountdown'
import PreorderItemGrid, { type PreorderGridItem } from '@/components/pos/PreorderItemGrid'
import BundleGrid from '@/components/pos/BundleGrid'
import CategoryTabs from '@/components/pos/CategoryTabs'
import AddonModal, { type AddonChoice } from '@/components/pos/AddonModal'
import type { Category, ProductBundleWithItems } from '@/types/database'
import {
  type CartLine, addCartLine, setLineQuantity, cartLinesToApiItems, cartLinesFromExistingOrder,
} from '@/lib/preorderCart'

interface SearchResult { id: string; name: string; is_staff: boolean }

function money(n: number) {
  return `$${n.toFixed(2)}`
}

export default function PreorderPage() {
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [enabled, setEnabled] = useState(true)
  const [dates, setDates] = useState<string[]>([])
  const [cutoffTime, setCutoffTime] = useState('20:00')
  const [sameDayCutoffTime, setSameDayCutoffTime] = useState<string | undefined>(undefined)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const debounceRef = useRef<NodeJS.Timeout>()

  const [forDate, setForDate] = useState('')
  const [items, setItems] = useState<PreorderGridItem[]>([])
  const [bundles, setBundles] = useState<ProductBundleWithItems[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [dateNote, setDateNote] = useState<string | null>(null)
  const [fallbackNames, setFallbackNames] = useState<Record<string, string>>({})
  const [loadingItems, setLoadingItems] = useState(false)
  const [lines, setLines] = useState<CartLine[]>([])
  const [existingPreorderId, setExistingPreorderId] = useState<string | null>(null)
  const [lastOrderLines, setLastOrderLines] = useState<CartLine[] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<{ total: number; staffPricing: boolean } | null>(null)

  const [itemSearch, setItemSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [addonItem, setAddonItem] = useState<PreorderGridItem | null>(null)

  useEffect(() => {
    fetch('/api/preorders/public/config').then(r => r.json()).then(json => {
      setEnabled(json.enabled)
      setDates(json.dates || [])
      setCutoffTime(json.cutoff_time || '20:00')
      setSameDayCutoffTime(json.same_day_cutoff_time || undefined)
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
    // Guard against the calendar being flipped again before this request
    // resolves — without this, a slow response for a date the user has
    // already navigated away from could land after (and clobber) the
    // response for the date they're actually looking at now.
    let cancelled = false
    setLoadingItems(true)
    setDone(null)
    Promise.all([
      fetch(`/api/preorders/public/items?bochur_id=${selected.id}&for_date=${forDate}`).then(r => r.json()),
      fetch(`/api/preorders/public/my-order?bochur_id=${selected.id}&for_date=${forDate}`).then(r => r.json()),
      fetch(`/api/preorders/public/last-order?bochur_id=${selected.id}&exclude_date=${forDate}`).then(r => r.json()),
    ]).then(([itemsJson, myOrderJson, lastOrderJson]) => {
      if (cancelled) return
      if (itemsJson.error) {
        console.error('Failed to load preorder items:', itemsJson.error)
        toast.error('Could not load items — please refresh and try again')
      }
      setItems(itemsJson.items || [])
      setBundles((itemsJson.bundles || []) as ProductBundleWithItems[])
      setCategories((itemsJson.categories || []) as Category[])
      setDateNote(itemsJson.date_note ?? null)
      const existing = myOrderJson.order
      if (existing) {
        setExistingPreorderId(existing.id)
        setLines(cartLinesFromExistingOrder(existing.preorder_items || []))
        const names: Record<string, string> = {}
        for (const it of existing.preorder_items || []) {
          if (it.is_bundle_component) continue
          const ref = it.bundle_id || it.product_id
          if (ref && it.product_name) names[ref] = it.product_name
        }
        setFallbackNames(names)
      } else {
        setExistingPreorderId(null)
        setLines([])
        setFallbackNames({})
      }
      const previous = lastOrderJson?.order
      setLastOrderLines(previous ? cartLinesFromExistingOrder(previous.preorder_items || []) : null)
      setLoadingItems(false)
    })
    return () => { cancelled = true }
  }, [selected, forDate])

  const itemsById = useMemo(() => {
    const m = new Map<string, PreorderGridItem>()
    items.forEach(i => m.set(i.id, i))
    return m
  }, [items])
  const bundlesById = useMemo(() => {
    const m = new Map<string, ProductBundleWithItems>()
    bundles.forEach(b => m.set(b.id, b))
    return m
  }, [bundles])

  const filteredItems = useMemo(() => items.filter(i => {
    if (itemSearch && !i.name.toLowerCase().includes(itemSearch.toLowerCase())) return false
    if (!selectedCategory) return true
    const itemCats = i.category_ids || []
    const selCat = categories.find(c => c.id === selectedCategory)
    if (selCat && !selCat.parent_id) {
      const subIds = categories.filter(c => c.parent_id === selectedCategory).map(c => c.id)
      return itemCats.includes(selectedCategory) || subIds.some(id => itemCats.includes(id))
    }
    return itemCats.includes(selectedCategory)
  }), [items, itemSearch, selectedCategory, categories])

  const quantitiesByRef = useMemo(() => {
    const q: Record<string, number> = {}
    lines.forEach(l => { q[l.refId] = (q[l.refId] || 0) + l.quantity })
    return q
  }, [lines])

  function addProductLine(item: PreorderGridItem, addons: AddonChoice[] = []) {
    setLines(prev => addCartLine(prev, {
      kind: 'product',
      refId: item.id,
      addonIds: addons.map(a => a.id),
      addonNames: addons.map(a => a.name),
    }))
  }

  function handleItemTap(item: PreorderGridItem) {
    if (item.addons.length > 0) { setAddonItem(item); return }
    addProductLine(item)
  }

  function handleBundleTap(bundle: ProductBundleWithItems) {
    setLines(prev => addCartLine(prev, { kind: 'bundle', refId: bundle.id }))
  }

  // Prefill from the person's most recent order, dropping anything that isn't
  // orderable for this date any more rather than sending a line the server
  // would just reject.
  function reorderLastTime() {
    if (!lastOrderLines) return
    const usable = lastOrderLines.filter(l =>
      l.kind === 'bundle' ? bundlesById.has(l.refId) : itemsById.has(l.refId)
    )
    if (usable.length === 0) {
      toast.error('None of those items are available for this date')
      return
    }
    setLines(usable.map(l => ({ ...l })))
    if (usable.length < lastOrderLines.length) {
      toast('Some items from last time aren\'t available for this date')
    }
  }

  function lineUnitPrice(line: CartLine): number {
    if (line.kind === 'bundle') return Number(bundlesById.get(line.refId)?.price ?? 0)
    const item = itemsById.get(line.refId)
    if (!item) return 0
    const addonTotal = line.addonIds.reduce(
      (sum, id) => sum + Number(item.addons.find(a => a.id === id)?.price_addition ?? 0), 0
    )
    return item.price + addonTotal
  }

  function lineName(line: CartLine): string {
    if (line.kind === 'bundle') return bundlesById.get(line.refId)?.name ?? fallbackNames[line.refId] ?? 'Deal'
    return itemsById.get(line.refId)?.name ?? fallbackNames[line.refId] ?? 'Item'
  }

  const total = lines.reduce((sum, l) => sum + lineUnitPrice(l) * l.quantity, 0)

  async function submit() {
    if (!selected || lines.length === 0) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/preorders/public/place', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bochur_id: selected.id,
          for_date: forDate,
          items: cartLinesToApiItems(lines),
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
    setLines([])
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

  const showBundles = bundles.length > 0 && !itemSearch && !selectedCategory
  const showCategoryRow = categories.filter(c => !c.parent_id).length > 1
  const showReorder = !existingPreorderId && lines.length === 0 && !!lastOrderLines && lastOrderLines.length > 0

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
            <PreorderCalendar
              cutoffTime={cutoffTime}
              sameDayCutoffTime={sameDayCutoffTime}
              selected={forDate}
              onSelect={setForDate}
              accent="teal"
            />
            {forDate && (
              <PreorderCutoffCountdown
                forDate={forDate}
                cutoffTime={cutoffTime}
                sameDayCutoffTime={sameDayCutoffTime}
                accent="teal"
              />
            )}
            {dates.length === 0 && (
              <p className="text-sm text-red-500">Ordering is closed for all upcoming dates right now.</p>
            )}
          </div>
        )}

        {selected && forDate && dateNote && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-2xl">
            <Pin className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900 whitespace-pre-wrap">{dateNote}</p>
          </div>
        )}

        {selected && forDate && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-stone-700">Items</label>
              {existingPreorderId && <span className="text-xs text-teal-700 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-full">Editing your order</span>}
            </div>

            {showReorder && (
              <button
                onClick={reorderLastTime}
                className="w-full flex items-center justify-center gap-2 py-2.5 min-h-[44px] border border-teal-200 bg-teal-50 text-teal-800 text-sm font-semibold rounded-xl hover:bg-teal-100 transition-colors"
              >
                <RotateCcw className="w-4 h-4" /> Order the same as last time
              </button>
            )}

            {!loadingItems && items.length > 0 && (
              <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-3 py-2.5">
                <Search className="w-4 h-4 text-stone-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Search items..."
                  value={itemSearch}
                  onChange={e => setItemSearch(e.target.value)}
                  className="flex-1 text-base outline-none"
                />
                {itemSearch && (
                  <button onClick={() => setItemSearch('')} className="text-stone-300 hover:text-stone-500"><X className="w-4 h-4" /></button>
                )}
              </div>
            )}

            {!loadingItems && showCategoryRow && (
              <div className="-mx-1 rounded-xl overflow-hidden border border-stone-100">
                <CategoryTabs categories={categories} selected={selectedCategory} onSelect={setSelectedCategory} />
              </div>
            )}

            {loadingItems ? (
              <p className="text-sm text-stone-400">Loading...</p>
            ) : items.length === 0 && bundles.length === 0 ? (
              <p className="text-sm text-stone-400">Nothing is orderable for this date right now.</p>
            ) : (
              <>
                <PreorderItemGrid
                  items={filteredItems}
                  quantities={quantitiesByRef}
                  accent="teal"
                  onTap={handleItemTap}
                  emptyLabel={itemSearch || selectedCategory ? 'No items match that filter' : 'Nothing is orderable for this date'}
                />
                {showBundles && (
                  <div className="mt-4">
                    <BundleGrid bundles={bundles} onBundleTap={handleBundleTap} />
                  </div>
                )}
              </>
            )}

            {lines.length > 0 && (
              <div className="space-y-2 pt-1">
                {lines.map(line => (
                  <div key={line.key} className="flex items-center justify-between p-2.5 border border-stone-100 rounded-xl">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-800 truncate">
                        {line.kind === 'bundle' && <span className="text-emerald-600 mr-1">Deal</span>}
                        {lineName(line)}
                      </p>
                      {line.addonNames.length > 0 && (
                        <p className="text-xs text-stone-400 truncate">+ {line.addonNames.join(', ')}</p>
                      )}
                      <p className="text-xs text-stone-500">{money(lineUnitPrice(line))} each</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => setLines(prev => setLineQuantity(prev, line.key, line.quantity - 1))} className="w-8 h-8 flex items-center justify-center bg-stone-100 rounded-lg"><Minus className="w-4 h-4" /></button>
                      <span className="w-6 text-center text-sm font-semibold">{line.quantity}</span>
                      <button onClick={() => setLines(prev => setLineQuantity(prev, line.key, line.quantity + 1))} className="w-8 h-8 flex items-center justify-center bg-stone-100 rounded-lg"><Plus className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
                <div className="p-3 bg-teal-50 border border-teal-100 rounded-xl flex items-center justify-between">
                  <span className="text-sm text-stone-600">Total due on pickup</span>
                  <span className="font-bold text-stone-900 text-lg">{money(total)}</span>
                </div>
              </div>
            )}

            <button
              onClick={submit}
              disabled={submitting || lines.length === 0}
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

      {addonItem && (
        <AddonModal
          product={{ id: addonItem.id, name: addonItem.name, icon: addonItem.icon }}
          preloadedAddons={addonItem.addons}
          onConfirm={addons => { addProductLine(addonItem, addons); setAddonItem(null) }}
          onSkip={() => { addProductLine(addonItem); setAddonItem(null) }}
          onClose={() => setAddonItem(null)}
        />
      )}
    </div>
  )
}
