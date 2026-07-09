'use client'

// Cashiers can navigate to /menu to view the printable menu on-screen (read-only, no editing).

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Download, Printer } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { Product, Category, ProductBundle } from '@/types/database'

interface BundleWithItems extends ProductBundle {
  bundle_items: Array<{
    quantity: number
    products: { name: string; price: number } | null
  }>
}

export default function MenuPage() {
  const supabase = createClient()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [productCategoryMap, setProductCategoryMap] = useState<Record<string, string[]>>({})
  const [bundles, setBundles] = useState<BundleWithItems[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [pRes, cRes, pcRes, bRes] = await Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('name'),
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order').order('name'),
      supabase.from('product_categories').select('product_id,category_id'),
      supabase
        .from('product_bundles')
        .select('*, bundle_items(quantity, products(name, price))')
        .eq('is_active', true)
        .order('sort_order')
        .order('name'),
    ])

    setProducts(pRes.data || [])
    setCategories(cRes.data || [])
    setBundles((bRes.data as BundleWithItems[]) || [])

    const pcMap: Record<string, string[]> = {}
    if (pcRes.data) {
      pcRes.data.forEach((row: any) => {
        if (!pcMap[row.product_id]) pcMap[row.product_id] = []
        pcMap[row.product_id].push(row.category_id)
      })
    }
    setProductCategoryMap(pcMap)
    setLoading(false)
  }

  // ─── CSV Export ──────────────────────────────────────────────────────────────
  function exportCSV() {
    // Sort products by category name then product name
    const getCategoryName = (productId: string): string => {
      const catIds = productCategoryMap[productId] || []
      if (catIds.length === 0) return 'Uncategorized'
      const cat = categories.find(c => c.id === catIds[0])
      return cat?.name ?? 'Uncategorized'
    }

    const sortedProducts = [...products].sort((a, b) => {
      const catA = getCategoryName(a.id)
      const catB = getCategoryName(b.id)
      if (catA !== catB) return catA.localeCompare(catB)
      return a.name.localeCompare(b.name)
    })

    const escapeCSV = (val: string | number | boolean | null | undefined) => {
      const str = String(val ?? '')
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str
    }

    const rows: string[] = []

    // Products section
    rows.push(['Name', 'Category', 'Price', 'Sale Price', 'Sale Active'].map(escapeCSV).join(','))
    sortedProducts.forEach(p => {
      rows.push([
        p.name,
        getCategoryName(p.id),
        p.price,
        p.sale_price ?? '',
        p.sale_active ? 'Yes' : 'No',
      ].map(escapeCSV).join(','))
    })

    // Separator before bundles
    rows.push('')
    rows.push(['Bundle Name', 'Description', 'Bundle Price', 'Original Price'].map(escapeCSV).join(','))
    bundles.forEach(b => {
      rows.push([
        b.name,
        b.description ?? '',
        b.price,
        b.original_price ?? '',
      ].map(escapeCSV).join(','))
    })

    const csv = rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'canteen-menu.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // ─── Group products by category ───────────────────────────────────────────
  const grouped: Array<{ category: Category; products: Product[] }> = categories.map(cat => ({
    category: cat,
    products: products
      .filter(p => (productCategoryMap[p.id] || []).includes(cat.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter(g => g.products.length > 0)

  const uncategorized = products
    .filter(p => (productCategoryMap[p.id] || []).length === 0)
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      {/* Print-only styles — scoped here to avoid global leakage */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; }
          .menu-container { box-shadow: none !important; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        {/* Header + action buttons (hidden when printing) */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6 no-print">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Menu</h1>
            <p className="text-slate-500 text-sm mt-1">
              {products.length} active products · {bundles.length} deals
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportCSV}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 text-white text-sm font-medium hover:bg-slate-600 transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Export Menu as CSV
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print Menu
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-400 no-print">Loading menu…</div>
        ) : (
          /* ── Printable menu card ── */
          <div className="menu-container bg-white rounded-2xl shadow-sm border border-slate-100 p-6 sm:p-8">
            {/* Menu header */}
            <div className="text-center mb-8 pb-6 border-b-2 border-slate-100">
              <div className="text-5xl mb-2">🍕</div>
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Canteen Menu</h2>
              <p className="text-slate-400 text-sm mt-1">All prices in USD</p>
            </div>

            {/* Products grouped by category */}
            <div className="space-y-8">
              {grouped.map(({ category, products: catProducts }) => (
                <section key={category.id}>
                  <h3
                    className="text-lg font-bold uppercase tracking-widest mb-3 pb-1 border-b"
                    style={{ color: category.color || '#1e293b', borderColor: category.color || '#e2e8f0' }}
                  >
                    {category.name}
                  </h3>
                  <ul className="space-y-2">
                    {catProducts.map(p => (
                      <ProductRow key={p.id} product={p} />
                    ))}
                  </ul>
                </section>
              ))}

              {/* Uncategorized products */}
              {uncategorized.length > 0 && (
                <section>
                  <h3 className="text-lg font-bold uppercase tracking-widest text-slate-500 mb-3 pb-1 border-b border-slate-200">
                    Other
                  </h3>
                  <ul className="space-y-2">
                    {uncategorized.map(p => (
                      <ProductRow key={p.id} product={p} />
                    ))}
                  </ul>
                </section>
              )}

              {/* Deals / Bundles */}
              {bundles.length > 0 && (
                <section>
                  <h3 className="text-lg font-bold uppercase tracking-widest text-amber-600 mb-3 pb-1 border-b border-amber-200">
                    🎁 Deals
                  </h3>
                  <ul className="space-y-3">
                    {bundles.map(b => {
                      const itemNames = b.bundle_items
                        .filter(bi => bi.products)
                        .map(bi => bi.quantity > 1 ? `${bi.quantity}× ${bi.products!.name}` : bi.products!.name)
                        .join(', ')
                      return (
                        <li key={b.id} className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-800">
                              {b.icon && <span className="mr-1.5">{b.icon}</span>}
                              {b.name}
                            </span>
                            {b.description && (
                              <span className="text-slate-500 text-sm ml-1.5">— {b.description}</span>
                            )}
                            {itemNames && (
                              <p className="text-slate-400 text-xs mt-0.5">{itemNames}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-bold text-amber-600">{formatCurrency(b.price)}</span>
                            {b.original_price && b.original_price > b.price && (
                              <span className="text-slate-400 text-xs line-through ml-1.5">
                                {formatCurrency(b.original_price)}
                              </span>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function ProductRow({ product: p }: { product: Product }) {
  const isSaleActive = p.sale_active && p.sale_price != null
  return (
    <li className="flex items-baseline justify-between gap-4">
      <span className="text-slate-800">
        {p.icon && <span className="mr-1.5">{p.icon}</span>}
        {p.name}
        {isSaleActive && p.sale_label && (
          <span className="ml-2 text-xs font-semibold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
            {p.sale_label}
          </span>
        )}
      </span>
      <span className="shrink-0 font-semibold text-slate-900">
        {isSaleActive ? (
          <>
            <span className="text-red-600">{formatCurrency(p.sale_price!)}</span>
            <span className="text-slate-400 text-sm line-through ml-1.5">{formatCurrency(p.price)}</span>
          </>
        ) : (
          formatCurrency(p.price)
        )}
      </span>
    </li>
  )
}
