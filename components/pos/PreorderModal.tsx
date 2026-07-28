'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, X, User, Plus, Minus, Truck, Pin } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { BochurWithId, Category, ProductBundleWithItems } from '@/types/database'
import PreorderCalendar from '@/components/PreorderCalendar'
import PreorderCutoffCountdown from '@/components/PreorderCutoffCountdown'
import PreorderItemGrid, { type PreorderGridItem } from '@/components/pos/PreorderItemGrid'
import BundleGrid from '@/components/pos/BundleGrid'
import CategoryTabs from '@/components/pos/CategoryTabs'
import AddonModal, { type AddonChoice } from '@/components/pos/AddonModal'
import {
  type CartLine, addCartLine, setLineQuantity, cartLinesToApiItems, cartLinesFromExistingOrder,
} from '@/lib/preorderCart'
import toast from 'react-hot-toast'

interface Props {
  onClose: () => void
  onSuccess?: () => void
}

// Session-scoped (not localStorage) on purpose — "the person I'm serving this
// shift", not a durable preference. Cleared when the browser session ends.
const LAST_BOCHUR_KEY = 'pos_preorder_last_bochur'

// Cashier-facing counterpart to app/preorder/page.tsx (the public link). Items,
// bundles, categories, pricing and daily-cap/"sold out" state all come from the
// exact same /api/preorders/public/items endpoint the public link uses (rather
// than re-deriving any of it client-side) so a cashier and a self-service
// camper/staff member always see the same picture for the same bochur+date.
// Likewise, an existing pending order for the selected bochur+date is looked up
// via /api/preorders/public/my-order and edited in place (preorder_id passed
// through to preorder-place) instead of always creating a new row — without
// this, placing a second preorder for someone who already has one pending for
// that date would silently create a duplicate that could get double-charged at
// "Confirm Received" time.
export default function PreorderModal({ onClose, onSuccess }: Props) {
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BochurWithId[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<BochurWithId | null>(null)
  const debounceRef = useRef<NodeJS.Timeout>()

  const [items, setItems] = useState<PreorderGridItem[]>([])
  const [bundles, setBundles] = useState<ProductBundleWithItems[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [dateNote, setDateNote] = useState<string | null>(null)
  const [fallbackNames, setFallbackNames] = useState<Record<string, string>>({})
  const [loadingItems, setLoadingItems] = useState(true)
  const [cutoffTime, setCutoffTime] = useState('20:00')
  const [sameDayCutoffTime, setSameDayCutoffTime] = useState<string | undefined>(undefined)
  const [dates, setDates] = useState<string[]>([])
  const [forDate, setForDate] = useState('')
  const [lines, setLines] = useState<CartLine[]>([])
  const [existingPreorderId, setExistingPreorderId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [itemSearch, setItemSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [addonItem, setAddonItem] = useState<PreorderGridItem | null>(null)

  // Cutoff config — loaded once, independent of which bochur/date gets picked.
  // Same endpoint the public link reads so both surfaces share one source of truth.
  useEffect(() => {
    fetch('/api/preorders/public/config')
      .then(r => r.json())
      .then(json => {
        const ct = json.cutoff_time || '20:00'
        setCutoffTime(ct)
        setSameDayCutoffTime(json.same_day_cutoff_time || undefined)
        const upcoming: string[] = json.dates || []
        setDates(upcoming)
        setForDate(upcoming[0] || '')
        if (upcoming.length === 0) setLoadingItems(false)
      })
      .catch(err => {
        console.error('PreorderModal: failed to load ordering settings', err)
        toast.error('Could not load ordering settings — try reopening this window')
        setLoadingItems(false)
      })
  }, [])

  // Restore the bochur this cashier was last serving, so reopening the modal
  // mid-shift for the same person doesn't mean re-searching them.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LAST_BOCHUR_KEY)
      if (raw) setSelected(JSON.parse(raw) as BochurWithId)
    } catch {
      // A malformed/unreadable entry is not worth surfacing — just start fresh.
    }
  }, [])

  function selectBochur(b: BochurWithId | null) {
    setSelected(b)
    try {
      if (b) sessionStorage.setItem(LAST_BOCHUR_KEY, JSON.stringify(b))
      else sessionStorage.removeItem(LAST_BOCHUR_KEY)
    } catch {
      // Private-mode / storage-disabled browsers: remembering is a nicety, never required.
    }
  }

  // Items (with live price/staff-pricing/remaining-cap), bundles, categories,
  // the date's pinned note, and this bochur's existing pending order for the
  // date — all re-fetched any time either the bochur or the date changes.
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
      setBundles((itemsJson.bundles || []) as ProductBundleWithItems[])
      setCategories((itemsJson.categories || []) as Category[])
      setDateNote(itemsJson.date_note ?? null)
      const existing = myOrderJson?.order
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
      setLoadingItems(false)
    }).catch(err => {
      if (cancelled) return
      console.error('PreorderModal: failed to load preorder items', err)
      toast.error('Could not load preorder items — try reopening this window')
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

  // Filtered view of the (small, date-bounded) already-loaded list — no query.
  const filteredItems = useMemo(() => items.filter(i => {
    if (itemSearch && !i.name.toLowerCase().includes(itemSearch.toLowerCase())) return false
    if (!selectedCategory) return true
    const itemCats = i.category_ids || []
    const selCat = categories.find(c => c.id === selectedCategory)
    // Top-level category selected → match it or any of its subcategories.
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

  // Per-line display price. The server always re-derives the real price at
  // submit time — this is purely so the cashier can read the cart back.
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

  const isStaff = !!selected?.account_type?.is_staff_pricing_tier
  const total = lines.reduce((sum, l) => sum + lineUnitPrice(l) * l.quantity, 0)
  const anyStaffPricing = lines.some(l => l.kind === 'product' && itemsById.get(l.refId)?.staff_pricing_applied)

  async function submit() {
    if (!selected) { toast.error('Search and select a bochur'); return }
    if (lines.length === 0) { toast.error('Select at least one item'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/pos/preorder-place', {
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
    setLines([])
    setExistingPreorderId(null)
  }

  const showBundles = bundles.length > 0 && !itemSearch && !selectedCategory
  const showCategoryRow = categories.filter(c => !c.parent_id).length > 1

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
                <button onClick={() => selectBochur(null)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-4 h-4" /></button>
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
                        onMouseDown={() => { selectBochur(b); setQuery(''); setOpen(false) }}
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
              <PreorderCalendar
                cutoffTime={cutoffTime}
                sameDayCutoffTime={sameDayCutoffTime}
                selected={forDate}
                onSelect={setForDate}
                accent="amber"
              />
            </div>
            {forDate && (
              <PreorderCutoffCountdown
                forDate={forDate}
                cutoffTime={cutoffTime}
                sameDayCutoffTime={sameDayCutoffTime}
                accent="amber"
              />
            )}
            {dates.length === 0 && <p className="text-xs text-red-500 mt-1">No dates currently open — cutoff is {cutoffTime} the evening before.</p>}
          </div>

          {/* Pinned message for this date */}
          {dateNote && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <Pin className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{dateNote}</p>
            </div>
          )}

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-semibold text-slate-700">Items</label>
              {existingPreorderId && <span className="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">Editing existing order</span>}
            </div>

            {!loadingItems && items.length > 0 && (
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 mb-2">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Search items..."
                  value={itemSearch}
                  onChange={e => setItemSearch(e.target.value)}
                  className="flex-1 text-sm outline-none"
                />
                {itemSearch && (
                  <button onClick={() => setItemSearch('')} className="text-slate-300 hover:text-slate-500"><X className="w-4 h-4" /></button>
                )}
              </div>
            )}

            {!loadingItems && showCategoryRow && (
              <div className="-mx-2 mb-1 rounded-xl overflow-hidden border border-slate-100">
                <CategoryTabs categories={categories} selected={selectedCategory} onSelect={setSelectedCategory} />
              </div>
            )}

            {loadingItems ? (
              <p className="text-sm text-slate-400">Loading...</p>
            ) : items.length === 0 && bundles.length === 0 ? (
              <p className="text-sm text-slate-400">No items are currently orderable — enable "Orderable via Preorders" on a product.</p>
            ) : (
              <>
                <PreorderItemGrid
                  items={filteredItems}
                  quantities={quantitiesByRef}
                  accent="amber"
                  onTap={handleItemTap}
                  emptyLabel={itemSearch || selectedCategory ? 'No items match that filter' : 'No items are currently orderable'}
                />
                {showBundles && (
                  <div className="mt-4">
                    <BundleGrid bundles={bundles} onBundleTap={handleBundleTap} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Cart */}
          {lines.length > 0 && (
            <div className="space-y-2">
              {lines.map(line => (
                <div key={line.key} className="flex items-center justify-between p-2.5 border border-slate-100 rounded-xl">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {line.kind === 'bundle' && <span className="text-emerald-600 mr-1">Deal</span>}
                      {lineName(line)}
                    </p>
                    {line.addonNames.length > 0 && (
                      <p className="text-xs text-slate-400 truncate">+ {line.addonNames.join(', ')}</p>
                    )}
                    <p className="text-xs text-slate-500">{formatCurrency(lineUnitPrice(line))} each</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setLines(prev => setLineQuantity(prev, line.key, line.quantity - 1))} className="w-7 h-7 flex items-center justify-center bg-slate-100 rounded-lg hover:bg-slate-200"><Minus className="w-3.5 h-3.5" /></button>
                    <span className="w-6 text-center text-sm font-semibold">{line.quantity}</span>
                    <button onClick={() => setLines(prev => setLineQuantity(prev, line.key, line.quantity + 1))} className="w-7 h-7 flex items-center justify-center bg-slate-100 rounded-lg hover:bg-slate-200"><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
              <div className="p-3.5 bg-amber-50 border border-amber-100 rounded-xl">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Total due on pickup</span>
                  <span className="font-bold text-slate-900 text-lg">{formatCurrency(total)}</span>
                </div>
                {anyStaffPricing && <p className="text-xs text-purple-600 mt-0.5">Staff discount applied</p>}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 p-4 shrink-0 space-y-2">
          <button
            onClick={submit}
            disabled={submitting || !selected || lines.length === 0 || !forDate}
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
