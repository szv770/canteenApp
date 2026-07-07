'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, X, User, AlertTriangle, Zap } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { BochurWithId } from '@/types/database'

export interface FeaturedItem {
  id: string
  product_id: string
  product_name: string
  label: string
}

interface Props {
  loadedBochur: BochurWithId | null
  onBochurLoaded: (b: BochurWithId) => void
  onClear: () => void
  onUsualTap?: (productId: string) => void
  lowBalanceThreshold?: number
  featuredItems?: FeaturedItem[]
}

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  Regular: 'bg-blue-50 text-blue-700 border border-blue-100',
  Shliach: 'bg-purple-50 text-purple-700 border border-purple-100',
  'Cost Price': 'bg-orange-50 text-orange-700 border border-orange-100',
  Moised: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  'Canteen Worker': 'bg-amber-50 text-amber-700 border border-amber-100',
}

interface Usual {
  product_id: string
  product_name: string
  count: number
}

export default function BochurSearch({ loadedBochur, onBochurLoaded, onClear, onUsualTap, lowBalanceThreshold = 5, featuredItems = [] }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BochurWithId[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [usuals, setUsuals] = useState<Usual[]>([])
  const debounceRef = useRef<NodeJS.Timeout>()
  const supabase = createClient()

  useEffect(() => {
    if (!loadedBochur || !onUsualTap) { setUsuals([]); return }
    fetchUsuals(loadedBochur.id)
  }, [loadedBochur?.id])

  async function fetchUsuals(bochurId: string) {
    const { data: orders } = await supabase
      .from('orders')
      .select('id')
      .eq('bochur_id', bochurId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(40)

    if (!orders || orders.length === 0) return
    const orderIds = orders.map((o: any) => o.id)

    const { data: items } = await supabase
      .from('order_items')
      .select('product_id, product_name, quantity')
      .in('order_id', orderIds)

    if (!items) return

    const countMap: Record<string, { name: string; count: number }> = {}
    for (const item of items as any[]) {
      if (!item.product_id) continue
      if (!countMap[item.product_id]) countMap[item.product_id] = { name: item.product_name, count: 0 }
      countMap[item.product_id].count += item.quantity
    }

    const sorted = Object.entries(countMap)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([product_id, v]) => ({ product_id, product_name: v.name, count: v.count }))

    setUsuals(sorted)
  }

  const search = useCallback((q: string) => {
    clearTimeout(debounceRef.current)
    if (!q.trim()) { setResults([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('bochurim_with_id')
        .select('*, account_type:account_types(*)')
        .or(`name.ilike.%${q}%,bochur_id.ilike.%${q}%`)
        .eq('archived', false)
        .limit(6)
      setResults(data || [])
      setOpen(true)
      setLoading(false)
    }, 220)
  }, [])

  if (loadedBochur) {
    const colorClass = ACCOUNT_TYPE_COLORS[loadedBochur.account_type?.name] || 'bg-slate-100 text-slate-600 border border-slate-200'
    const balanceColor = loadedBochur.balance >= 0 ? 'text-emerald-600' : 'text-red-500'
    return (
      <div className="space-y-1.5">
        <div className={`flex items-center gap-2.5 bg-white border rounded-xl px-3 py-2 min-w-0 focus-within:ring-2 focus-within:ring-amber-400/40 transition-all ${loadedBochur.is_frozen ? 'border-red-300 bg-red-50/30' : 'border-slate-200 focus-within:border-amber-400'}`}>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${loadedBochur.is_frozen ? 'bg-red-100' : 'bg-amber-100'}`}>
            <User className={`w-4 h-4 ${loadedBochur.is_frozen ? 'text-red-600' : 'text-amber-600'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-slate-900 text-sm truncate">{loadedBochur.name}</span>
              {loadedBochur.account_type?.name && (
                <span className={`badge ${colorClass} text-xs`}>{loadedBochur.account_type.name}</span>
              )}
            </div>
            <span className={`text-xs font-bold ${balanceColor}`}>{formatCurrency(loadedBochur.balance)}</span>
          </div>
          <button onClick={onClear} className="shrink-0 p-1 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        {loadedBochur.is_frozen && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="text-xs font-semibold">Account Frozen</span>
            {loadedBochur.freeze_reason && (
              <span className="text-xs text-red-500 truncate">— {loadedBochur.freeze_reason}</span>
            )}
          </div>
        )}
        {!loadedBochur.is_frozen && loadedBochur.balance < lowBalanceThreshold && lowBalanceThreshold > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="text-xs font-semibold">Low Balance — only {loadedBochur.balance < 0 ? 'negative' : `$${loadedBochur.balance.toFixed(2)}`} left</span>
          </div>
        )}
        {(onUsualTap && (usuals.length > 0 || featuredItems.length > 0)) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Zap className="w-3 h-3 text-amber-400 shrink-0" />
            {featuredItems.filter(f => f.product_id).map(f => (
              <button
                key={`featured-${f.id}`}
                onClick={() => onUsualTap!(f.product_id)}
                className="px-2.5 py-1 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full hover:bg-indigo-100 transition-colors"
                title={f.label}
              >
                ⭐ {f.product_name}
              </button>
            ))}
            {usuals.map(u => (
              <button
                key={u.product_id}
                onClick={() => onUsualTap!(u.product_id)}
                className="px-2.5 py-1 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full hover:bg-amber-100 transition-colors"
              >
                {u.product_name}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-amber-400/40 focus-within:border-amber-400 transition-all">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          type="text"
          placeholder="Search bochur by name or ID..."
          value={query}
          onChange={e => { setQuery(e.target.value); search(e.target.value) }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="flex-1 text-base text-slate-900 placeholder-slate-400 bg-transparent outline-none"
        />
        {loading && <div className="w-4 h-4 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin shrink-0" />}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-100 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
          {results.map(b => {
            const colorClass = ACCOUNT_TYPE_COLORS[b.account_type?.name] || 'bg-slate-100 text-slate-600 border border-slate-200'
            const balanceColor = b.balance >= 0 ? 'text-emerald-600' : 'text-red-500'
            return (
              <button
                key={b.id}
                onMouseDown={() => { onBochurLoaded(b); setQuery(''); setOpen(false) }}
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
                  {b.account_type?.name && (
                    <span className={`badge ${colorClass} text-xs`}>{b.account_type.name}</span>
                  )}
                </div>
                <span className={`text-sm font-bold shrink-0 ${balanceColor}`}>{formatCurrency(b.balance)}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
