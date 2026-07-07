'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LogOut, Settings, ShoppingCart } from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import BochurSearch from '@/components/pos/BochurSearch'
import CategoryTabs from '@/components/pos/CategoryTabs'
import ProductGrid from '@/components/pos/ProductGrid'
import CartPanel from '@/components/pos/Cart'
import CheckoutModal from '@/components/pos/CheckoutModal'
import AddonModal from '@/components/pos/AddonModal'
import type { Category, Product, CartItem, BochurWithId, AppSettings, ProductVariant, ProductAddon } from '@/types/database'

export default function PosPage() {
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const router = useRouter()

  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productCategoryMap, setProductCategoryMap] = useState<Record<string, string[]>>({})
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [cashierName, setCashierName] = useState('')
  const [cashierRole, setCashierRole] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [loadedBochur, setLoadedBochur] = useState<BochurWithId | null>(null)
  const [showCheckout, setShowCheckout] = useState(false)
  const [productVariantsMap, setProductVariantsMap] = useState<Record<string, ProductVariant[]>>({})
  const [addonProduct, setAddonProduct] = useState<Product | null>(null)
  const [addonVariant, setAddonVariant] = useState<ProductVariant | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [mobileCartOpen, setMobileCartOpen] = useState(false)

  useEffect(() => {
    loadData()
    loadCashier()

    // Redirect to login if session expires mid-use
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        if (event === 'SIGNED_OUT') {
          window.location.href = '/login'
        }
      }
    })

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

    return () => {
      subscription.unsubscribe()
      supabase.removeChannel(channel)
    }
  }, [])

  async function loadData() {
    const [cats, prods, setts, catLinks, allVariants] = await Promise.all([
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
      supabase.from('settings').select('*'),
      supabase.from('product_categories').select('product_id,category_id'),
      supabase.from('product_variants').select('*').eq('is_active', true).order('sort_order'),
    ])
    if (cats.data) setCategories(cats.data)
    if (prods.data) setProducts(prods.data)
    if (setts.data) {
      const map: Record<string, string> = {}
      setts.data.forEach((s: any) => { map[s.key] = String(s.value) })
      setSettings(map)
    }
    if (catLinks.data) {
      const pcMap: Record<string, string[]> = {}
      catLinks.data.forEach((row: any) => {
        if (!pcMap[row.product_id]) pcMap[row.product_id] = []
        pcMap[row.product_id].push(row.category_id)
      })
      setProductCategoryMap(pcMap)
    }
    if (allVariants.data) {
      const vMap: Record<string, ProductVariant[]> = {}
      allVariants.data.forEach((v: ProductVariant) => {
        if (!vMap[v.product_id]) vMap[v.product_id] = []
        vMap[v.product_id].push(v)
      })
      setProductVariantsMap(vMap)
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
    window.location.href = '/login'
  }

  function addToCart(product: Product, variant?: ProductVariant, addons?: ProductAddon[]) {
    const basePrice = variant ? variant.price : product.price
    const price = !variant && product.sale_active && product.sale_price != null
      ? product.sale_price
      : basePrice
    const variantLabel = variant?.label ?? null
    const variantId = variant?.id ?? null
    const addonIds = addons && addons.length > 0 ? addons.map(a => a.id) : undefined
    const addonNames = addons && addons.length > 0 ? addons.map(a => a.name) : undefined
    const addonTotal = addons && addons.length > 0 ? addons.reduce((sum, a) => sum + a.price_addition, 0) : undefined

    setCart(prev => {
      // If item has addons, always add as new line (don't merge)
      if (addonIds && addonIds.length > 0) {
        return [...prev, {
          product_id: product.id,
          variant_id: variantId,
          name: product.name,
          variant_label: variantLabel,
          icon: product.icon,
          price,
          quantity: 1,
          addon_ids: addonIds,
          addon_names: addonNames,
          addon_total: addonTotal,
        }]
      }
      const existing = prev.find(i =>
        i.product_id === product.id && i.variant_id === variantId &&
        (!i.addon_ids || i.addon_ids.length === 0)
      )
      if (existing) {
        return prev.map(i =>
          i.product_id === product.id && i.variant_id === variantId &&
          (!i.addon_ids || i.addon_ids.length === 0)
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

  async function checkAndShowAddonModal(product: Product, variant?: ProductVariant) {
    const { data } = await supabase
      .from('product_addons')
      .select('id')
      .eq('product_id', product.id)
      .eq('is_active', true)
      .limit(1)
    if (data && data.length > 0) {
      setAddonProduct(product)
      setAddonVariant(variant)
    } else {
      addToCart(product, variant)
    }
  }

  function handleProductTap(product: Product, variant?: ProductVariant) {
    checkAndShowAddonModal(product, variant)
  }

  const filteredProducts = products.filter(p => {
    const matchesSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())
    if (!matchesSearch) return false
    if (!selectedCategory) return true
    return (productCategoryMap[p.id] || []).includes(selectedCategory)
  })

  const outOfStockBehavior = settings['out_of_stock_behavior'] || 'warn'
  const coinRounding = settings['coin_rounding'] === 'true'
  const cartItemCount = cart.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <div className="h-screen bg-slate-50 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-3 z-20 shrink-0 shadow-sm">
        {/* Logo */}
        <div className="flex items-center gap-2 mr-1 sm:mr-2 shrink-0">
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center text-white text-lg shadow-sm">
            🛒
          </div>
          <span className="font-bold text-slate-900 text-lg hidden sm:block">Canteen</span>
        </div>

        {/* Bochur search - grows to fill */}
        <div className="flex-1 min-w-0">
          <BochurSearch
            loadedBochur={loadedBochur}
            onBochurLoaded={setLoadedBochur}
            onClear={() => setLoadedBochur(null)}
          />
        </div>

        <div className="flex items-center gap-1 sm:gap-2 ml-1 shrink-0">
          {cashierName && (
            <span className="text-sm text-slate-500 hidden md:block">
              {cashierName}
            </span>
          )}
          {cashierRole === 'admin' && (
            <button
              onClick={() => router.push('/dashboard')}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all"
              title="Admin"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={signOut}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all"
            title="Sign out"
          >
            <LogOut className="w-5 h-5" />
          </button>
          {/* Mobile cart toggle */}
          <button
            onClick={() => setMobileCartOpen(true)}
            className="lg:hidden relative p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all"
            aria-label="Open cart"
          >
            <ShoppingCart className="w-5 h-5" />
            {cartItemCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-amber-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {cartItemCount > 9 ? '9+' : cartItemCount}
              </span>
            )}
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
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Search bar */}
          <div className="px-3 sm:px-4 pt-3 pb-2 shrink-0">
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full max-w-sm px-4 py-2.5 bg-white border border-slate-100 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all text-base"
            />
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto px-3 sm:px-4 pb-4">
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 pt-1">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center bg-white rounded-2xl border border-slate-100 p-3 animate-pulse">
                    <div className="w-14 h-14 bg-slate-200 rounded-xl mb-2" />
                    <div className="h-3 bg-slate-200 rounded w-3/4 mb-1" />
                    <div className="h-4 bg-slate-200 rounded w-1/2 mt-auto" />
                  </div>
                ))}
              </div>
            ) : (
              <ProductGrid
                products={filteredProducts}
                variantsMap={productVariantsMap}
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
          mobileOpen={mobileCartOpen}
          onMobileClose={() => setMobileCartOpen(false)}
        />
      </div>

      {/* Modals */}
      {addonProduct && (
        <AddonModal
          product={addonProduct}
          onConfirm={(selectedAddons) => {
            addToCart(addonProduct, addonVariant, selectedAddons)
            setAddonProduct(null)
            setAddonVariant(undefined)
          }}
          onSkip={() => {
            addToCart(addonProduct, addonVariant)
            setAddonProduct(null)
            setAddonVariant(undefined)
          }}
          onClose={() => {
            setAddonProduct(null)
            setAddonVariant(undefined)
          }}
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
            setMobileCartOpen(false)
            if (loadedBochur) loadData()
            toast.success('Order completed!')
          }}
        />
      )}
    </div>
  )
}
