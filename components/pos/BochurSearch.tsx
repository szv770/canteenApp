'use client'

import { useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, X, User } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { BochurWithId } from '@/types/database'

interface Props {
  loadedBochur: BochurWithId | null
  onBochurLoaded: (b: BochurWithId) => void
  onClear: () => void
}

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  Regular: 'bg-blue-100 text-blue-700',
  Shliach: 'bg-purple-100 text-purple-700',
  'Cost Price': 'bg-orange-100 text-orange-700',
  Moised: 'bg-green-100 text-green-700',
  'Canteen Worker': 'bg-amber-100 text-amber-700',
}

export default function BochurSearch({ loadedBochur, onBochurLoaded, onClear }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BochurWithId[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout>()
  const supabase = createClient()

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
    const colorClass = ACCOUNT_TYPE_COLORS[loadedBochur.account_type?.name] || 'bg-gray-100 text-gray-700'
    const balanceColor = loadedBochur.balance >= 0 ? 'text-emerald-600' : 'text-red-500'
    return (
      <div className="flex items-center gap-2 bg-white border border-pos-border rounded-xl px-3 py-2 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-brand-light flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-brand" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-pos-text text-sm truncate">{loadedBochur.name}</span>
            <span className={`badge ${colorClass} text-xs`}>{loadedBochur.account_type?.name}</span>
          </div>
          <span className={`text-xs font-bold ${balanceColor}`}>{formatCurrency(loadedBochur.balance)}</span>
        </div>
        <button onClick={onClear} className="shrink-0 p-1 hover:bg-gray-100 rounded-lg transition-colors">
          <X className="w-4 h-4 text-pos-muted" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-white border border-pos-border rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-brand/30 focus-within:border-brand transition-all">
        <Search className="w-4 h-4 text-pos-muted shrink-0" />
        <input
          type="text"
          placeholder="Search bochur by name or ID..."
          value={query}
          onChange={e => { setQuery(e.target.value); search(e.target.value) }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="flex-1 text-base text-pos-text placeholder-pos-muted bg-transparent outline-none"
        />
        {loading && <div className="w-4 h-4 border-2 border-brand/40 border-t-brand rounded-full animate-spin shrink-0" />}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-pos-border rounded-xl shadow-lg z-50 overflow-hidden animate-fade-in">
          {results.map(b => {
            const colorClass = ACCOUNT_TYPE_COLORS[b.account_type?.name] || 'bg-gray-100 text-gray-700'
            const balanceColor = b.balance >= 0 ? 'text-emerald-600' : 'text-red-500'
            return (
              <button
                key={b.id}
                onMouseDown={() => { onBochurLoaded(b); setQuery(''); setOpen(false) }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-pos-hover transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-brand-light flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-brand" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-pos-text text-sm">{b.name}</span>
                    <span className="text-pos-muted text-xs">{b.bochur_id}</span>
                  </div>
                  <span className={`badge ${colorClass} text-xs`}>{b.account_type?.name}</span>
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
