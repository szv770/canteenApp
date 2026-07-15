'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LogOut, Settings, ShoppingCart, Wallet, Trash2, BarChart2, Bell, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import BochurSearch from '@/components/pos/BochurSearch'
import CategoryTabs, { DEALS_TAB } from '@/components/pos/CategoryTabs'
import ProductGrid from '@/components/pos/ProductGrid'
import BundleGrid from '@/components/pos/BundleGrid'
import CartPanel from '@/components/pos/Cart'
import CheckoutModal from '@/components/pos/CheckoutModal'
import AddonModal from '@/components/pos/AddonModal'
import VariantModal from '@/components/pos/VariantModal'
import TopUpModal from '@/components/pos/TopUpModal'
import WastageModal from '@/components/pos/WastageModal'
import type { Category, Product, CartItem, BochurWithId, ProductVariant, ProductAddon, ProductBundleWithItems } from '@/types/database'
import { formatCurrency } from '@/lib/utils'

interface NotifItem {
  id: string
  message: string
  type: string
  created_at: string
}

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
  const [quickCharging, setQuickCharging] = useState(false)
  const [productVariantsMap, setProductVariantsMap] = useState<Record<string, ProductVariant[]>>({})
  const [variantProduct, setVariantProduct] = useState<Product | null>(null)
  const [addonProduct, setAddonProduct] = useState<Product | null>(null)
  const [addonVariant, setAddonVariant] = useState<ProductVariant | undefined>(undefined)
  const [bundles, setBundles] = useState<ProductBundleWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const [showTopUp, setShowTopUp] = useState(false)
  const [showWastage, setShowWastage] = useState(false)
  const [notifHistory, setNotifHistory] = useState<NotifItem[]>([])
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('pos_dismissed_notifs')
      return new Set(stored ? JSON.parse(stored) : [])
    } catch { return new Set() }
  })
  const [notifPanelOpen, setNotifPanelOpen] = useState(false)
  const [viewingNotif, setViewingNotif] = useState<NotifItem | null>(null)
  const notifPanelRef = useRef<HTMLDivElement>(null)

  const unreadNotifCount = notifHistory.filter(n => !dismissedIds.has(n.id)).length

  function dismissNotif(id: string) {
    setDismissedIds(prev => {
      const next = new Set(prev)
      next.add(id)
      try { localStorage.setItem('pos_dismissed_notifs', JSON.stringify(Array.from(next))) } catch {}
      return next
    })
  }

  function dismissAll() {
    setNotifHistory(prev => {
      const ids = prev.map(n => n.id)
      setDismissedIds(prev2 => {
        const next = new Set(prev2)
        ids.forEach(id => next.add(id))
        try { localStorage.setItem('pos_dismissed_notifs', JSON.stringify(Array.from(next))) } catch {}
        return next
      })
      return prev
    })
  }

  useEffect(() => {
    if (!notifPanelOpen) return
    function handleClick(e: MouseEvent) {
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target as Node)) {
        setNotifPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [notifPanelOpen])

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

    // Admin → cashier notifications
    const seen = new Set<string>()

    function showNotif(n: { id: string; message: string; type: string; is_active: boolean; expires_at: string | null; created_at?: string }) {
      if (!n.is_active || seen.has(n.id)) return
      if (n.expires_at && new Date(n.expires_at) < new Date()) return
      seen.add(n.id)

      setNotifHistory(prev => {
        if (prev.find(h => h.id === n.id)) return prev
        return [{ id: n.id, message: n.message, type: n.type, created_at: n.created_at || new Date().toISOString() }, ...prev]
      })

      const toastId = n.id
      if (n.type === 'urgent') {
        toast.custom(
          (t) => (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '12px',
              background: '#fef2f2', color: '#991b1b', border: '2px solid #fca5a5',
              fontWeight: 600, fontSize: '15px', padding: '12px 14px', borderRadius: '12px',
              maxWidth: '380px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            }}>
              <span style={{ flex: 1 }}>🚨 {n.message}</span>
              <button
                onClick={() => toast.dismiss(t.id)}
                style={{
                  background: 'rgba(153,27,27,0.15)', border: 'none', borderRadius: '6px',
                  padding: '4px 10px', color: '#991b1b', fontWeight: 700, cursor: 'pointer',
                  flexShrink: 0, fontSize: '14px', lineHeight: '1.4',
                }}
              >✕</button>
            </div>
          ),
          { duration: Infinity, id: toastId }
        )
      } else if (n.type === 'warning') {
        toast.custom(
          (t) => (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '12px',
              background: '#fffbeb', color: '#92400e', border: '2px solid #fcd34d',
              fontWeight: 600, fontSize: '15px', padding: '12px 14px', borderRadius: '12px',
              maxWidth: '380px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            }}>
              <span style={{ flex: 1 }}>⚠️ {n.message}</span>
              <button
                onClick={() => toast.dismiss(t.id)}
                style={{
                  background: 'rgba(146,64,14,0.15)', border: 'none', borderRadius: '6px',
                  padding: '4px 10px', color: '#92400e', fontWeight: 700, cursor: 'pointer',
                  flexShrink: 0, fontSize: '14px', lineHeight: '1.4',
                }}
              >✕</button>
            </div>
          ),
          { duration: 20000, id: toastId }
        )
      } else {
        toast.custom(
          (t) => (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '12px',
              background: '#eff6ff', color: '#1e3a5f', border: '1px solid #bfdbfe',
              fontWeight: 500, fontSize: '15px', padding: '12px 14px', borderRadius: '12px',
              maxWidth: '380px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            }}>
              <span style={{ flex: 1 }}>ℹ️ {n.message}</span>
              <button
                onClick={() => toast.dismiss(t.id)}
                style={{
                  background: 'rgba(30,58,95,0.1)', border: 'none', borderRadius: '6px',
                  padding: '4px 10px', color: '#1e3a5f', fontWeight: 700, cursor: 'pointer',
                  flexShrink: 0, fontSize: '14px', lineHeight: '1.4',
                }}
              >✕</button>
            </div>
          ),
          { duration: 12000, id: toastId }
        )
      }
    }

    // Show any active notifications that exist when the POS loads (cashier may have missed the INSERT event)
    supabase
      .from('cashier_notifications')
      .select('id, message, type, is_active, expires_at')
      .eq('is_active', true)
      .then(({ data }) => { (data || []).forEach(showNotif) })

    const notifChannel = supabase
      .channel('pos_notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'cashier_notifications',
      }, (payload) => {
        showNotif(payload.new as { id: string; message: string; type: string; is_active: boolean; expires_at: string | null })
      })
      .subscribe()

    return () => {
      subscription.unsubscribe()
      supabase.removeChannel(channel)
      supabase.removeChannel(notifChannel)
    }
  }, [])

  async function loadData() {
    const [cats, prods, setts, catLinks, allVariants, allBundles] = await Promise.all([
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
      supabase.from('settings').select('*'),
      supabase.from('product_categories').select('product_id,category_id'),
      supabase.from('product_variants').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('product_bundles').select('*, bundle_items(id, product_id, quantity, products(name, icon))').eq('is_active', true).order('sort_order'),
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
    if (allBundles.data) setBundles(allBundles.data as ProductBundleWithItems[])
    setLoading(false)
  }

  async function quickCharge() {
    if (!loadedBochur || quickCharging || cart.length === 0) return
    const total = Math.round(cart.reduce((sum, i) => sum + (i.price + (i.addon_total || 0)) * i.quantity, 0) * 100) / 100
    setQuickCharging(true)
    try {
      const res = await fetch('/api/pos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'balance',
          bochur_id: loadedBochur.id,
          tip_amount: 0,
          items: cart.map(item => ({
            product_id: item.product_id,
            variant_id: item.variant_id,
            quantity: item.quantity,
            addon_ids: item.addon_ids ?? [],
            bundle_id: item.bundle_id ?? null,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Charge failed')
      toast.success(`Charged ${formatCurrency(total)} to ${loadedBochur.name}`)
      setCart([])
      setLoadedBochur(null)
      setMobileCartOpen(false)
      loadData()
    } catch (err: any) {
      const msg = err?.message || ''
      if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network')) {
        toast.error('Network error — please check your connection and try again', { duration: 5000 })
      } else {
        toast.error(msg || 'Charge failed — please try again')
      }
    } finally {
      setQuickCharging(false)
    }
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

  function addBundleToCart(bundle: ProductBundleWithItems) {
    const includedNames = bundle.bundle_items
      .map(bi => `${bi.quantity > 1 ? `${bi.quantity}x ` : ''}${(bi as any).products?.name || ''}`)
      .filter(Boolean)
    setCart(prev => {
      const existing = prev.find(i => i.bundle_id === bundle.id)
      if (existing) {
        return prev.map(i => i.bundle_id === bundle.id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, {
        product_id: bundle.id,
        variant_id: null,
        name: bundle.name,
        variant_label: null,
        icon: bundle.icon,
        price: bundle.price,
        quantity: 1,
        is_bundle: true,
        bundle_id: bundle.id,
        bundle_included_names: includedNames,
      }]
    })
    toast.success(`Added ${bundle.name}`, {
      duration: 1200,
      style: { background: '#1E293B', color: '#F8FAFC' }
    })
  }

  function handleProductTap(product: Product) {
    if (product.has_variants) {
      setVariantProduct(product)
    } else {
      checkAndShowAddonModal(product)
    }
  }

  const filteredProducts = products.filter(p => {
    const matchesSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())
    if (!matchesSearch) return false
    if (!selectedCategory || selectedCategory === DEALS_TAB) return true
    const productCats = productCategoryMap[p.id] || []
    const selCat = categories.find(c => c.id === selectedCategory)
    // Top-level category selected → match the category itself OR any of its subcategories
    if (selCat && !selCat.parent_id) {
      const subIds = categories.filter(c => c.parent_id === selectedCategory).map(c => c.id)
      return productCats.includes(selectedCategory) || subIds.some(id => productCats.includes(id))
    }
    // Subcategory (or unknown) → exact match only
    return productCats.includes(selectedCategory)
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
          <button
            onClick={() => setShowTopUp(true)}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 min-h-[44px] rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
            title="Top up an account"
          >
            <Wallet className="w-4 h-4" />
            <span className="hidden sm:inline">Top Up</span>
          </button>
          <button
            onClick={() => setShowWastage(true)}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 min-h-[44px] rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
            title="Log wastage"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Wastage</span>
          </button>
          <button
            onClick={() => router.push('/cashier-dashboard')}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all"
            title="My activity"
          >
            <BarChart2 className="w-5 h-5" />
          </button>
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
          {/* Notification bell */}
          <div className="relative" ref={notifPanelRef}>
            <button
              onClick={() => setNotifPanelOpen(v => !v)}
              className="relative p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all"
              title="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                </span>
              )}
            </button>

            {notifPanelOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <span className="font-semibold text-slate-900 text-sm">Notifications</span>
                  {notifHistory.some(n => !dismissedIds.has(n.id)) && (
                    <button
                      onClick={dismissAll}
                      className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      Dismiss all
                    </button>
                  )}
                </div>
                {(() => {
                  const visibleNotifs = notifHistory.filter(n => !dismissedIds.has(n.id))
                  if (visibleNotifs.length === 0) {
                    return <div className="px-4 py-8 text-center text-slate-400 text-sm">No notifications</div>
                  }
                  return (
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
                      {visibleNotifs.map(n => {
                        const emoji = n.type === 'urgent' ? '🚨' : n.type === 'warning' ? '⚠️' : 'ℹ️'
                        const badge = n.type === 'urgent'
                          ? 'bg-red-100 text-red-700'
                          : n.type === 'warning'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                        return (
                          <div
                            key={n.id}
                            onClick={() => setViewingNotif(n)}
                            className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                          >
                            <span className="text-lg mt-0.5 shrink-0">{emoji}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`text-xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${badge}`}>
                                  {n.type}
                                </span>
                                <span className="text-xs text-slate-400">
                                  {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <p className="text-sm text-slate-700 leading-snug truncate">{n.message}</p>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); dismissNotif(n.id) }}
                              className="shrink-0 p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>

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
        hasDeals={bundles.length > 0}
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
            ) : selectedCategory === DEALS_TAB ? (
              <BundleGrid bundles={bundles} onBundleTap={addBundleToCart} />
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
          onQuickCharge={quickCharge}
          quickCharging={quickCharging}
          mobileOpen={mobileCartOpen}
          onMobileClose={() => setMobileCartOpen(false)}
        />
      </div>

      {/* Modals */}
      {variantProduct && (
        <VariantModal
          product={variantProduct}
          preloadedVariants={productVariantsMap[variantProduct.id]}
          onSelect={(variant) => {
            setVariantProduct(null)
            checkAndShowAddonModal(variantProduct, variant)
          }}
          onClose={() => setVariantProduct(null)}
        />
      )}

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

      {showTopUp && (
        <TopUpModal
          onClose={() => setShowTopUp(false)}
          onSuccess={() => { if (loadedBochur) loadData() }}
          settings={settings}
        />
      )}

      {showWastage && (
        <WastageModal
          onClose={() => setShowWastage(false)}
          onSuccess={() => { setShowWastage(false); loadData() }}
        />
      )}

      {viewingNotif && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                viewingNotif.type === 'urgent'
                  ? 'bg-red-100 text-red-700'
                  : viewingNotif.type === 'warning'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-blue-100 text-blue-700'
              }`}>
                {viewingNotif.type}
              </span>
              <span className="text-xs text-slate-400">
                {new Date(viewingNotif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap mb-6">
              {viewingNotif.message}
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setViewingNotif(null)}
                className="btn-secondary text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
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
