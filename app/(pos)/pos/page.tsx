'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LogOut, Settings } from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import BochurSearch from '@/components/pos/BochurSearch'
import CategoryTabs from '@/components/pos/CategoryTabs'
import ProductGrid from '@/components/pos/ProductGrid'
import CartPanel from '@/components/pos/Cart'
import CheckoutModal from '@/components/pos/CheckoutModal'
import VariantModal from '@/components/pos/VariantModal'
import type { Category, Product, CartItem, BochurWithId, AppSettings, ProductVariant } from '@/types/database'

export default function PosPage() {
  const supabase = createClient()
  const router = useRouter()

  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [cashierName, setCashierName] = useState('')
  const [cashierRole, setCashierRole] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [loadedBochur, setLoadedBochur] = useState<BochurWithId | null>(null)
  const [showCheckout, setShowCheckout] = useState(false)
  const [variantProduct, setVariantProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    loadCashier()

    // Real-time product updates
    const channel = supabase
      .channel('pos_realtime')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'products',
      }, (payload) => {
        setProducts(prev => prev.map(p =>
          p.id === payload.new.id ? { ...p, ...payload.new } : p
        ))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function loadData() {
    const [cats, prods, setts] = await Promise.all([
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
      supabase.from('settings').select('*'),
    ])
    if (cats.data) setCategories(cats.data)
    if (prods.data) setProducts(prods.data)
    if (setts.data) {
      const map: Record<string, string> = {}
      setts.data.forEach((s: any) => { map[s.key] = String(s.value) })
      setSettings(map)
    }
    setLoading(false)
  }

  async function loadCashier() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('cashier_profiles').select('name,role').eq('id', user.id).single()
    if (data) { setCashierName(data.name); setCashierRole(data.role) }
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function addToCart(product: Product, variant?: ProductVariant) {
    const key = variant ? `${product.id}-${variant.id}` : product.id
    const price = variant ? variant.price : product.price
    const variantLabel = variant?.label ?? null
    const variantId = variant?.id ?? null

    setCart(prev => {
      const existing = prev.find(i =>
        i.product_id === product.id && i.variant_id === variantId
      )
      if (existing) {
        return prev.map(i =>
          i.product_id === product.id && i.variant_id === variantId
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      }
      return [...prev, {
        product_id: product.id,
        variant_id: variantId,
        name: product.name,
        variant_label: variantLabel,
        icon: product.icon,
        price,
        quantity: 1,
      }]
    })
    toast.success(`Added ${product.name}${variantLabel ? ` (${variantLabel})` : ''}`, {
      duration: 1200,
      style: { background: '#1E293B', color: '#F8FAFC' }
    })
  }

  function handleProductTap(product: Product) {
    if (product.has_variants) {
      setVariantProduct(product)
    } else {
      addToCart(product)
    }
  }

  const filteredProducts = products.filter(p => {
    const matchesSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())
    if (!matchesSearch) return false
    if (!selectedCategory) return true
    // Would need product_categories join — for now show all when category selected
    return true
  })

  const outOfStockBehavior = settings['out_of_stock_behavior'] || 'warn'
  const coinRounding = settings['coin_rounding'] === 'true'

  return (
    <div className="h-screen bg-pos-bg flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-pos-border px-4 py-3 flex items-center gap-3 z-20 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mr-2">
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center text-white text-lg">
            🛒
          </div>
          <span className="font-bold text-pos-text text-lg hidden sm:block">Canteen</span>
        </div>

        {/* Bochur search - grows to fill */}
        <div className="flex-1 max-w-md">
          <BochurSearch
            loadedBochur={loadedBochur}
            onBochurLoaded={setLoadedBochur}
            onClear={() => setLoadedBochur(null)}
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {cashierName && (
            <span className="text-sm text-pos-subtext hidden md:block">
              {cashierName}
            </span>
          )}
          {cashierRole === 'admin' && (
            <button
              onClick={() => router.push('/dashboard')}
              className="p-2 rounded-xl text-pos-subtext hover:bg-pos-hover hover:text-pos-text transition-all"
              title="Admin"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={signOut}
            className="p-2 rounded-xl text-pos-subtext hover:bg-red-50 hover:text-red-500 transition-all"
            title="Sign out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Category tabs */}
      <CategoryTabs
        categories={categories}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
      />

      {/* Main body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Product area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search bar */}
          <div className="px-4 pt-3 pb-2 shrink-0">
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full max-w-sm px-4 py-2 bg-white border border-pos-border rounded-xl text-pos-text placeholder-pos-muted focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all text-sm"
            />
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {loading ? (
              <div className="flex items-center justify-center h-48 text-pos-muted">
                Loading products...
              </div>
            ) : (
              <ProductGrid
                products={filteredProducts}
                outOfStockBehavior={outOfStockBehavior}
                onProductTap={handleProductTap}
              />
            )}
          </div>
        </div>

        {/* Cart panel */}
        <CartPanel
          cart={cart}
          setCart={setCart}
          loadedBochur={loadedBochur}
          settings={settings}
          onCheckout={() => setShowCheckout(true)}
        />
      </div>

      {/* Modals */}
      {variantProduct && (
        <VariantModal
          product={variantProduct}
          onSelect={(variant) => {
            addToCart(variantProduct, variant)
            setVariantProduct(null)
          }}
          onClose={() => setVariantProduct(null)}
        />
      )}

      {showCheckout && (
        <CheckoutModal
          cart={cart}
          loadedBochur={loadedBochur}
          settings={settings}
          cashierName={cashierName}
          onClose={() => setShowCheckout(false)}
          onSuccess={() => {
            setCart([])
            setShowCheckout(false)
            setLoadedBochur(null)
            if (loadedBochur) loadData()
            toast.success('Order completed!')
          }}
        />
      )}
    </div>
  )
}
