'use client'

import { Package, Plus } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Product } from '@/types/database'

interface Props {
  products: Product[]
  outOfStockBehavior: string
  onProductTap: (product: Product) => void
}

export default function ProductGrid({ products, outOfStockBehavior, onProductTap }: Props) {
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
          outOfStockBehavior={outOfStockBehavior}
          onTap={onProductTap}
        />
      ))}
    </div>
  )
}

function ProductCard({ product, outOfStockBehavior, onTap }: {
  product: Product
  outOfStockBehavior: string
  onTap: (p: Product) => void
}) {
  // For variant products, stock lives on variants — don't block/hide at the product level
  const outOfStock = !product.has_variants && product.stock_quantity <= 0
  const lowStock = !product.has_variants && !outOfStock && product.stock_quantity <= product.low_stock_threshold
  const isBlocked = outOfStock && outOfStockBehavior === 'block'
  const isHidden = outOfStock && (outOfStockBehavior === 'hide' || !product.show_when_out_of_stock)

  if (isHidden) return null

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
      {/* Stock badges */}
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

      {/* Add indicator */}
      {!isBlocked && (
        <div className="absolute top-2 right-2 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-150 shadow-sm scale-75 group-hover:scale-100">
          <Plus className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
        </div>
      )}

      {/* Emoji / icon */}
      <div className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center mb-2 sm:mb-2.5">
        {product.icon ? (
          <span className="text-3xl sm:text-4xl leading-none select-none">{product.icon}</span>
        ) : (
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-100 rounded-xl flex items-center justify-center">
            <Package className="w-5 h-5 sm:w-6 sm:h-6 text-slate-300" />
          </div>
        )}
      </div>

      {/* Name */}
      <p className="text-xs sm:text-[13px] font-semibold text-slate-800 text-center line-clamp-2 leading-snug w-full mb-1.5">
        {product.name}
      </p>

      {/* Price */}
      <p className="text-sm font-bold text-amber-600 mt-auto">
        {product.has_variants ? `From ${formatCurrency(product.price)}` : formatCurrency(product.price)}
      </p>
    </button>
  )
}
