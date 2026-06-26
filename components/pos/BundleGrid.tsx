'use client'

import { Gift, Plus } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { ProductBundleWithItems } from '@/types/database'

interface Props {
  bundles: ProductBundleWithItems[]
  onBundleTap: (bundle: ProductBundleWithItems) => void
}

export default function BundleGrid({ bundles, onBundleTap }: Props) {
  if (bundles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
          <Gift className="w-8 h-8 text-slate-300" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-500">No deals available</p>
          <p className="text-xs text-slate-400 mt-0.5">Check back soon for bundle offers</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 pt-1">
      <div className="flex items-center gap-2">
        <span className="text-lg">🔥</span>
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Bundle Deals</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
        {bundles.map(bundle => (
          <BundleCard key={bundle.id} bundle={bundle} onTap={onBundleTap} />
        ))}
      </div>
    </div>
  )
}

function BundleCard({ bundle, onTap }: {
  bundle: ProductBundleWithItems
  onTap: (b: ProductBundleWithItems) => void
}) {
  const savings = bundle.original_price != null && bundle.original_price > bundle.price
    ? bundle.original_price - bundle.price
    : null

  const includedNames = bundle.bundle_items
    .map(bi => `${bi.quantity > 1 ? `${bi.quantity}x ` : ''}${bi.products?.name || ''}`)
    .filter(Boolean)
    .join(', ')

  return (
    <button
      onClick={() => onTap(bundle)}
      className={cn(
        'group relative flex flex-col items-center bg-white rounded-xl border border-emerald-100 p-3 sm:p-4 transition-all duration-150 text-left min-h-[130px] sm:min-h-[148px]',
        'shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-emerald-300 active:scale-[0.97] active:shadow-sm cursor-pointer'
      )}
    >
      {/* Savings badge */}
      {savings != null && (
        <span className="absolute top-2 left-2 badge bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] leading-none py-0.5 px-1.5">
          Save {formatCurrency(savings)}
        </span>
      )}

      {/* Add indicator */}
      <div className="absolute top-2 right-2 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-150 shadow-sm scale-75 group-hover:scale-100">
        <Plus className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
      </div>

      {/* Icon */}
      {bundle.icon && (
        <div className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center mb-1.5 shrink-0">
          <span className="text-2xl sm:text-3xl leading-none select-none">{bundle.icon}</span>
        </div>
      )}

      {/* Name */}
      <p className={`text-xs sm:text-[13px] font-semibold text-slate-800 text-center line-clamp-2 leading-snug w-full ${bundle.icon ? '' : 'mt-2'}`}>
        {bundle.name}
      </p>

      {/* Included items sub-text */}
      {includedNames && (
        <p className="text-[10px] text-slate-400 text-center leading-snug mt-0.5 line-clamp-2 w-full">
          {includedNames}
        </p>
      )}

      {/* Price */}
      <div className="mt-auto pt-1.5 flex flex-col items-center">
        <p className="text-sm font-bold text-amber-600">{formatCurrency(bundle.price)}</p>
        {bundle.original_price != null && (
          <p className="text-[11px] text-slate-400 line-through leading-none">{formatCurrency(bundle.original_price)}</p>
        )}
      </div>
    </button>
  )
}
