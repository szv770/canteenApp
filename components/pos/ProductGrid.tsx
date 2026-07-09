'use client'

import { Package, Plus } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Product, ProductVariant } from '@/types/database'

interface Props {
  products: Product[]
  variantsMap: Record<string, ProductVariant[]>
  outOfStockBehavior: string
  onProductTap: (product: Product) => void
}

export default function ProductGrid({ products, variantsMap, outOfStockBehavior, onProductTap }: Props) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
          <Package className="w-8 h-8 text-slate-300" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-500">No products found</p>
          <p className="text-xs text-slate-400 mt-0.5">Try a different category or search</p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 pt-1">
      {products.map(product => (
        <ProductCard
          key={product.id}
          product={product}
          variantsMap={variantsMap}
          outOfStockBehavior={outOfStockBehavior}
          onTap={onProductTap}
        />
      ))}
    </div>
  )
}

function ProductCard({ product, variantsMap, outOfStockBehavior, onTap }: {
  product: Product
  variantsMap: Record<string, ProductVariant[]>
  outOfStockBehavior: string
  onTap: (p: Product) => void
}) {
  const variants = variantsMap[product.id] || []
  const tracked = !product.has_variants && product.stock_quantity !== null
  const outOfStock = tracked && product.stock_quantity! <= 0
  const lowStock = tracked && !outOfStock && product.stock_quantity! <= product.low_stock_threshold
  const isBlocked = outOfStock && outOfStockBehavior === 'block'
  const isHidden = outOfStock && (outOfStockBehavior === 'hide' || !product.show_when_out_of_stock)

  const onSale = !product.has_variants && product.sale_active && product.sale_price != null
  const effectivePrice = onSale ? product.sale_price! : product.price
  const fromPrice = product.has_variants && variants.length > 0
    ? Math.min(...variants.map(v => v.price))
    : null

  if (isHidden) return null

  const hasVisual = !!(product.image_url || product.icon)

  return (
    <button
      onClick={() => !isBlocked && onTap(product)}
      disabled={isBlocked}
      className={cn(
        'group relative flex flex-col items-center bg-white rounded-xl border border-slate-100 p-3 sm:p-4 transition-all duration-150 text-left min-h-[130px] sm:min-h-[148px]',
        'shadow-sm',
        isBlocked
          ? 'opacity-40 cursor-not-allowed'
          : 'hover:shadow-md hover:-translate-y-0.5 hover:border-amber-200 active:scale-[0.97] active:shadow-sm cursor-pointer'
      )}
    >
      {onSale && !outOfStock && (
        <span className="absolute top-2 left-2 badge bg-red-500 text-white text-[10px] leading-none py-0.5 px-1.5">
          SALE
        </span>
      )}
      {outOfStock && (
        <span className="absolute top-2 left-2 badge bg-red-50 text-red-500 border border-red-100 text-[10px] leading-none py-0.5 px-1.5">
          Out
        </span>
      )}
      {lowStock && (
        <span className="absolute top-2 left-2 badge bg-amber-50 text-amber-600 border border-amber-100 text-[10px] leading-none py-0.5 px-1.5">
          Low
        </span>
      )}

      {!isBlocked && (
        <div className="absolute top-2 right-2 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-150 shadow-sm scale-75 group-hover:scale-100">
          <Plus className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
        </div>
      )}

      {hasVisual && (
        <div className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center mb-1.5 shrink-0 overflow-hidden">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-10 h-10 sm:w-11 sm:h-11 object-cover rounded-lg"
            />
          ) : (
            <span className="text-2xl sm:text-3xl leading-none select-none">{product.icon}</span>
          )}
        </div>
      )}

      <p className={`text-xs sm:text-[13px] font-semibold text-slate-800 text-center line-clamp-3 leading-snug w-full ${hasVisual ? '' : 'mt-2'}`}>
        {product.name}
      </p>

      <div className="mt-auto pt-1.5 flex flex-col items-center gap-0.5">
        {onSale && (
          <span className="text-[11px] text-slate-400 line-through leading-none">
            {formatCurrency(product.price)}
          </span>
        )}
        {fromPrice !== null ? (
          <p className="text-sm font-bold text-amber-600">From {formatCurrency(fromPrice)}</p>
        ) : (
          <p className={`text-sm font-bold ${onSale ? 'text-red-500' : 'text-amber-600'}`}>
            {formatCurrency(effectivePrice)}
          </p>
        )}
      </div>
    </button>
  )
}
