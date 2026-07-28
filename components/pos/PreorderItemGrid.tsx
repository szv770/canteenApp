'use client'

import { Package, Plus, Truck, ChefHat } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import type { AddonChoice } from './AddonModal'

// The shape /api/preorders/public/items returns per item. Both Preorders
// surfaces (POS modal + public /preorder link) render the exact same grid off
// it, so a cashier and a self-service camper always see the same picture.
export interface PreorderGridItem {
  id: string
  name: string
  icon: string | null
  image_url: string | null
  price: number
  staff_pricing_applied: boolean
  preorder_source: 'vendor' | 'in_house'
  remaining_cap: number | null
  addons: AddonChoice[]
  category_ids?: string[]
}

const ACCENT = {
  amber: {
    hoverBorder: 'hover:border-amber-200',
    addBtn: 'bg-amber-500',
    price: 'text-amber-600',
    qty: 'bg-amber-500',
  },
  teal: {
    hoverBorder: 'hover:border-teal-200',
    addBtn: 'bg-teal-600',
    price: 'text-teal-700',
    qty: 'bg-teal-600',
  },
} as const

interface Props {
  /** Already filtered by the parent (search/category live there) — this just renders. */
  items: PreorderGridItem[]
  /** How many of each item are currently in the cart, for the corner count badge. */
  quantities?: Record<string, number>
  accent?: keyof typeof ACCENT
  onTap: (item: PreorderGridItem) => void
  emptyLabel?: string
}

// Only shows an exact remaining count once it's genuinely getting scarce —
// "3 left" is useful, "184 left" is noise.
const LOW_CAP_THRESHOLD = 10

export default function PreorderItemGrid({ items, quantities = {}, accent = 'amber', onTap, emptyLabel }: Props) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3">
        <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
          <Package className="w-7 h-7 text-slate-300" />
        </div>
        <p className="text-sm font-medium text-slate-500 text-center px-4">
          {emptyLabel || 'No items match'}
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
      {items.map(item => (
        <PreorderItemCard
          key={item.id}
          item={item}
          inCart={quantities[item.id] || 0}
          accent={accent}
          onTap={onTap}
        />
      ))}
    </div>
  )
}

function PreorderItemCard({ item, inCart, accent, onTap }: {
  item: PreorderGridItem
  inCart: number
  accent: keyof typeof ACCENT
  onTap: (item: PreorderGridItem) => void
}) {
  const colors = ACCENT[accent]
  // An item the person already has in this cart is never "sold out" for them —
  // their own committed quantity is what's counted against the cap upstream.
  const soldOut = item.remaining_cap != null && item.remaining_cap <= 0 && inCart === 0
  const lowStock = !soldOut && item.remaining_cap != null && item.remaining_cap <= LOW_CAP_THRESHOLD
  const hasVisual = !!(item.image_url || item.icon)

  return (
    <button
      type="button"
      onClick={() => !soldOut && onTap(item)}
      disabled={soldOut}
      className={cn(
        'group relative flex flex-col items-center bg-white rounded-xl border border-slate-100 p-3 transition-all duration-150 text-left min-h-[130px] shadow-sm',
        soldOut
          ? 'opacity-40 cursor-not-allowed'
          : `cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97] active:shadow-sm ${colors.hoverBorder}`
      )}
    >
      {/* Remaining-cap state: an exact count while it's scarce, "Sold out" only at 0 */}
      {soldOut ? (
        <span className="absolute top-2 left-2 badge bg-red-50 text-red-500 border border-red-100 text-[10px] leading-none py-0.5 px-1.5">
          Sold out
        </span>
      ) : lowStock ? (
        <span className="absolute top-2 left-2 badge bg-amber-50 text-amber-600 border border-amber-100 text-[10px] leading-none py-0.5 px-1.5">
          {item.remaining_cap} left
        </span>
      ) : null}

      {inCart > 0 ? (
        <span className={`absolute top-2 right-2 w-6 h-6 ${colors.qty} rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-sm`}>
          {inCart}
        </span>
      ) : !soldOut && (
        <div className={`absolute top-2 right-2 w-6 h-6 ${colors.addBtn} rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-150 shadow-sm scale-75 group-hover:scale-100`}>
          <Plus className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
        </div>
      )}

      {hasVisual && (
        <div className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center mb-1.5 shrink-0 overflow-hidden mt-2">
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} className="w-10 h-10 sm:w-11 sm:h-11 object-cover rounded-lg" />
          ) : (
            <span className="text-2xl sm:text-3xl leading-none select-none">{item.icon}</span>
          )}
        </div>
      )}

      <p className={`text-xs sm:text-[13px] font-semibold text-slate-800 text-center line-clamp-3 leading-snug w-full ${hasVisual ? '' : 'mt-6'}`}>
        {item.name}
      </p>

      <div className="mt-auto pt-1.5 flex flex-col items-center gap-0.5 w-full">
        <p className={`text-sm font-bold ${colors.price}`}>{formatCurrency(item.price)}</p>
        <div className="flex items-center gap-1 flex-wrap justify-center">
          {/* Badge only — never a camper-vs-staff price comparison (see CLAUDE.md). */}
          {item.staff_pricing_applied && (
            <span className="text-[10px] text-purple-600 leading-none">Staff price</span>
          )}
          {item.addons.length > 0 && (
            <span className="text-[10px] text-slate-400 leading-none">+ extras</span>
          )}
        </div>
      </div>

      <span className="absolute bottom-2 left-2 text-slate-300" title={item.preorder_source === 'vendor' ? 'From the vendor' : 'Made in-house'}>
        {item.preorder_source === 'vendor'
          ? <Truck className="w-3 h-3" />
          : <ChefHat className="w-3 h-3" />}
      </span>
    </button>
  )
}
