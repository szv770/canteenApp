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
  Regular: 'bg-blue-50 text-blue-700 border border-blue-100',
  Shliach: 'bg-purple-50 text-purple-700 border border-purple-100',
  'Cost Price': 'bg-orange-50 text-orange-700 border border-orange-100',
  Moised: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  'Canteen Worker': 'bg-amber-50 text-amber-700 border border-amber-100',
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
    const colorClass = ACCOUNT_TYPE_COLORS[loadedBochur.account_type?.name] || 'bg-slate-100 text-slate-600 border border-slate-200'
    const balanceColor = loadedBochur.balance >= 0 ? 'text-emerald-600' : 'text-red-500'
    return (
      <div className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-3 py-2 min-w-0 focus-within:ring-2 focus-within:ring-amber-400/40 focus-within:border-amber-400 transition-all">
        <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-amber-600" />
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
