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
      <div className="flex flex-col items-center justify-center h-48 text-pos-muted gap-2">
        <Package className="w-10 h-10 opacity-40" />
        <p className="text-sm">No products found</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 pt-1">
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
  const outOfStock = product.stock_quantity <= 0
  const lowStock = !outOfStock && product.stock_quantity <= product.low_stock_threshold
  const isBlocked = outOfStock && outOfStockBehavior === 'block'
  const isHidden = outOfStock && (outOfStockBehavior === 'hide' || !product.show_when_out_of_stock)

  if (isHidden) return null

  return (
    <button
      onClick={() => !isBlocked && onTap(product)}
      disabled={isBlocked}
      className={cn(
        'group relative flex flex-col items-center bg-white rounded-2xl border border-pos-border p-3 transition-all duration-150 text-left',
        isBlocked
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:border-brand/40 hover:shadow-md hover:shadow-brand/10 active:scale-95 cursor-pointer'
      )}
    >
      {/* Stock badges */}
      {outOfStock && (
        <span className="absolute top-2 left-2 badge bg-red-100 text-red-600 text-xs">
          Out
        </span>
      )}
      {lowStock && (
        <span className="absolute top-2 left-2 badge bg-amber-100 text-amber-600 text-xs">
          Low
        </span>
      )}

      {/* Add indicator */}
      {!isBlocked && (
        <div className="absolute top-2 right-2 w-6 h-6 bg-brand rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
          <Plus className="w-3.5 h-3.5 text-white" />
        </div>
      )}

      {/* Emoji / icon */}
      <div className="w-14 h-14 flex items-center justify-center mb-2">
        {product.icon ? (
          <span className="text-4xl leading-none select-none">{product.icon}</span>
        ) : (
          <div className="w-12 h-12 bg-pos-hover rounded-xl flex items-center justify-center">
            <Package className="w-6 h-6 text-pos-muted" />
          </div>
        )}
      </div>

      {/* Name */}
      <p className="text-xs font-medium text-pos-text text-center line-clamp-2 leading-tight w-full mb-1">
        {product.name}
      </p>

      {/* Price */}
      <p className="text-sm font-bold text-brand mt-auto">
        {formatCurrency(product.price)}
      </p>
    </button>
  )
}
