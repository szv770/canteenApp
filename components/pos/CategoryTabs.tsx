'use client'

import { useRef } from 'react'
import { cn } from '@/lib/utils'
import type { Category } from '@/types/database'

interface Props {
  categories: Category[]
  selected: string | null
  onSelect: (id: string | null) => void
}

export default function CategoryTabs({ categories, selected, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <div className="bg-white border-b border-pos-border shrink-0">
      <div
        ref={scrollRef}
        className="flex items-center gap-2 px-3 sm:px-4 py-2 overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: 'none' }}
      >
        <button
          onClick={() => onSelect(null)}
          className={cn(
            'shrink-0 px-4 py-2 min-h-[44px] rounded-full text-sm font-medium transition-all duration-150 whitespace-nowrap',
            !selected
              ? 'bg-brand text-white shadow-sm shadow-brand/20'
              : 'bg-pos-hover text-pos-subtext hover:text-pos-text hover:bg-gray-100'
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
                ? 'bg-brand text-white shadow-sm shadow-brand/20'
                : 'bg-pos-hover text-pos-subtext hover:text-pos-text hover:bg-gray-100'
            )}
          >
            {cat.name}
          </button>
        ))}
      </div>
    </div>
  )
}
