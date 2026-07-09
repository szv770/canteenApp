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

  const topCategories = categories.filter(c => !c.parent_id)

  // Which top-level tab is active — derived from the current selection.
  // If a subcategory is selected, its parent is the active top-level.
  const selectedCat = selected && selected !== DEALS_TAB
    ? categories.find(c => c.id === selected)
    : undefined
  const activeTopId = selectedCat ? (selectedCat.parent_id || selectedCat.id) : null

  const subCategories = activeTopId
    ? categories.filter(c => c.parent_id === activeTopId)
    : []

  return (
    <div className="bg-white border-b border-slate-100 shrink-0">
      {/* Top-level row */}
      <div
        ref={scrollRef}
        className="flex items-center gap-2 px-3 sm:px-4 py-2.5 overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: 'none' }}
      >
        {hasDeals && (
          <button
            onClick={() => onSelect(DEALS_TAB)}
            className={cn(
              'shrink-0 px-5 py-2.5 min-h-[48px] rounded-full text-base font-semibold transition-all duration-150 whitespace-nowrap flex items-center gap-1.5',
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
            'shrink-0 px-5 py-2.5 min-h-[48px] rounded-full text-base font-semibold transition-all duration-150 whitespace-nowrap',
            !selected
              ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
          )}
        >
          All Items
        </button>
        {topCategories.map(cat => (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={cn(
              'shrink-0 px-5 py-2.5 min-h-[48px] rounded-full text-base font-semibold transition-all duration-150 whitespace-nowrap',
              activeTopId === cat.id
                ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
            )}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Subcategory row — only when the active top-level has subcategories */}
      {subCategories.length > 0 && (
        <div
          className="flex items-center gap-1.5 px-3 sm:px-4 pb-2.5 -mt-0.5 overflow-x-auto scrollbar-hide"
          style={{ scrollbarWidth: 'none' }}
        >
          <button
            onClick={() => onSelect(activeTopId)}
            className={cn(
              'shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 whitespace-nowrap',
              selected === activeTopId
                ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300'
                : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            )}
          >
            All
          </button>
          {subCategories.map(sub => (
            <button
              key={sub.id}
              onClick={() => onSelect(sub.id)}
              className={cn(
                'shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 whitespace-nowrap',
                selected === sub.id
                  ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300'
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              )}
            >
              {sub.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
