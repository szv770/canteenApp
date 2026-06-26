'use client'

import { useRef } from 'react'
import { cn } from '@/lib/utils'
import type { Category } from '@/types/database'

export const DEALS_TAB = '__deals__'

interface Props {
  categories: Category[]
  selected: string | null
  onSelect: (id: string | null) => void
  hasDeals?: boolean
}

export default function CategoryTabs({ categories, selected, onSelect, hasDeals }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <div className="bg-white border-b border-slate-100 shrink-0">
      <div
        ref={scrollRef}
        className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: 'none' }}
      >
        {hasDeals && (
          <button
            onClick={() => onSelect(DEALS_TAB)}
            className={cn(
              'shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-150 whitespace-nowrap flex items-center gap-1.5',
              selected === DEALS_TAB
                ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            )}
          >
            🔥 Deals
          </button>
        )}
        <button
          onClick={() => onSelect(null)}
          className={cn(
            'shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-150 whitespace-nowrap',
            !selected || selected === DEALS_TAB ? (selected === DEALS_TAB ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800' : 'bg-amber-500 text-white shadow-sm shadow-amber-500/30')
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
          )}
        >
          All Items
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={cn(
              'shrink-0 px-4 py-2 min-h-[44px] rounded-full text-sm font-medium transition-all duration-150 whitespace-nowrap',
              selected === cat.id
                ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
            )}
          >
            {cat.name}
          </button>
        ))}
      </div>
    </div>
  )
}
