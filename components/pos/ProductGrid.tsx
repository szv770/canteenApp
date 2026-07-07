'use client'

import { Package, Plus } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Product, ProductVariant } from '@/types/database'

interface Props {
  products: Product[]
  variantsMap: Record<string, ProductVariant[]>
  outOfStockBehavior: string
  onProductTap: (product: Product, variant?: ProductVariant) => void
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

  const cards: React.ReactNode[] = []
  for (const product of products) {
    const variants = variantsMap[product.id]
    if (product.has_variants && variants && variants.length > 0) {
      for (const variant of variants) {
        cards.push(
          <VariantCard
            key={`${product.id}-${variant.id}`}
            product={product}
            variant={variant}
            outOfStockBehavior={outOfStockBehavior}
            onTap={onProductTap}
          />
        )
      }
    } else {
      cards.push(
        <ProductCard
          key={product.id}
          product={product}
          outOfStockBehavior={outOfStockBehavior}
          onTap={onProductTap}
        />
      )
    }
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 pt-1">
      {cards}
    </div>
  )
}

function VariantCard({ product, variant, outOfStockBehavior, onTap }: {
  product: Product
  variant: ProductVariant
  outOfStockBehavior: string
  onTap: (p: Product, v: ProductVariant) => void
}) {
  const outOfStock = variant.stock_quantity <= 0
  const lowStock = !outOfStock && variant.stock_quantity <= (product.low_stock_threshold || 5)
  const isBlocked = outOfStock && outOfStockBehavior === 'block'
  const isHidden = outOfStock && (outOfStockBehavior === 'hide' || !product.show_when_out_of_stock)

  if (isHidden) return null

  return (
    <button
      onClick={() => !isBlocked && onTap(product, variant)}
      disabled={isBlocked}
      className={cn(
        'group relative flex flex-col items-center bg-white rounded-xl border border-slate-100 p-3 sm:p-4 transition-all duration-150 text-left min-h-[130px] sm:min-h-[148px]',
        'shadow-sm',
        isBlocked
          ? 'opacity-40 cursor-not-allowed'
          : 'hover:shadow-md hover:-translate-y-0.5 hover:border-amber-200 active:scale-[0.97] active:shadow-sm cursor-pointer'
      )}
    >
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

      {product.icon && (
        <div className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center mb-1.5 shrink-0">
          <span className="text-2xl sm:text-3xl leading-none select-none">{product.icon}</span>
        </div>
      )}

      <p className={`text-xs sm:text-[13px] font-semibold text-slate-800 text-center line-clamp-3 leading-snug w-full ${product.icon ? '' : 'mt-2'}`}>
        {variant.label}
      </p>

      <div className="mt-auto pt-1.5 flex flex-col items-center gap-0.5">
        <p className="text-sm font-bold text-amber-600">{formatCurrency(variant.price)}</p>
      </div>
    </button>
  )
}

function ProductCard({ product, outOfStockBehavior, onTap }: {
  product: Product
  outOfStockBehavior: string
  onTap: (p: Product) => void
}) {
  const outOfStock = !product.has_variants && product.stock_quantity <= 0
  const lowStock = !product.has_variants && !outOfStock && product.stock_quantity <= product.low_stock_threshold
  const isBlocked = outOfStock && outOfStockBehavior === 'block'
  const isHidden = outOfStock && (outOfStockBehavior === 'hide' || !product.show_when_out_of_stock)

  const onSale = product.sale_active && product.sale_price != null
  const effectivePrice = onSale ? product.sale_price! : product.price

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

      {product.icon && (
        <div className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center mb-1.5 shrink-0">
          <span className="text-2xl sm:text-3xl leading-none select-none">{product.icon}</span>
        </div>
      )}

      <p className={`text-xs sm:text-[13px] font-semibold text-slate-800 text-center line-clamp-3 leading-snug w-full ${product.icon ? '' : 'mt-2'}`}>
        {product.name}
      </p>

      <div className="mt-auto pt-1.5 flex flex-col items-center gap-0.5">
        {onSale && (
          <span className="text-[11px] text-slate-400 line-through leading-none">
            {formatCurrency(product.price)}
          </span>
        )}
        <p className={`text-sm font-bold ${onSale ? 'text-red-500' : 'text-amber-600'}`}>
          {formatCurrency(effectivePrice)}
        </p>
      </div>
    </button>
  )
}
