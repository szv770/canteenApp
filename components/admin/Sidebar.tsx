'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Users, Package, Warehouse,
  Receipt, Settings, CreditCard, ShoppingBag, LogOut, UserCog, Menu, X, BarChart2, Gift,
  RotateCcw, BookOpen, TrendingDown, Bell
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/bochurim', icon: Users, label: 'Bochurim' },
  { href: '/products', icon: Package, label: 'Products' },
  { href: '/bundles', icon: Gift, label: 'Bundles' },
  { href: '/inventory', icon: Warehouse, label: 'Inventory' },
  { href: '/transactions', icon: Receipt, label: 'Transactions' },
  { href: '/refund-requests', icon: RotateCcw, label: 'Refund Requests' },
  { href: '/reports', icon: BarChart2, label: 'Reports' },
  { href: '/menu', icon: BookOpen, label: 'Menu' },
  { href: '/cogs', icon: TrendingDown, label: 'COGS' },
  { href: '/notifications', icon: Bell, label: 'Notifications' },
  { href: '/topups', icon: CreditCard, label: 'Top-ups' },
  { href: '/cashiers', icon: UserCog, label: 'Cashiers' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

export default function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [pendingRefunds, setPendingRefunds] = useState(0)

  useEffect(() => {
    let active = true
    async function loadCount() {
      const { count } = await supabase
        .from('refund_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
      if (active) setPendingRefunds(count || 0)
    }
    loadCount()
    const channel = supabase
      .channel('sidebar_refund_requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'refund_requests' }, loadCount)
      .subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [pathname])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  function navigate(href: string) {
    router.push(href)
    setMobileOpen(false)
  }

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center shadow-sm shadow-amber-500/30">
              <ShoppingBag className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-sm tracking-tight">Canteen POS</p>
              <p className="text-slate-400 text-xs">Admin Panel</p>
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto">
        {NAV.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <button
              key={item.href}
              onClick={() => navigate(item.href)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 min-h-[44px] relative',
                active
                  ? 'bg-white/10 text-white before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-0.5 before:bg-amber-400 before:rounded-full'
                  : 'text-slate-400 hover:bg-white/8 hover:text-slate-200'
              )}
            >
              <item.icon className={cn('w-4 h-4 shrink-0', active ? 'text-amber-400' : '')} />
              <span className={active ? 'text-white font-semibold' : ''}>{item.label}</span>
              {item.href === '/refund-requests' && pendingRefunds > 0 && (
                <span className="ml-auto min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-amber-500 text-white text-xs font-bold rounded-full">
                  {pendingRefunds > 9 ? '9+' : pendingRefunds}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Bottom actions */}
      <div className="p-2.5 border-t border-white/10 space-y-0.5 shrink-0">
        <button
          onClick={() => navigate('/pos')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-white/8 hover:text-slate-200 transition-all min-h-[44px]"
        >
          <ShoppingBag className="w-4 h-4" />
          Go to POS
        </button>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-red-500/15 hover:text-red-400 transition-all min-h-[44px]"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3.5 left-3.5 z-30 p-2.5 bg-slate-800 text-white rounded-xl shadow-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-60 bg-slate-800 flex flex-col h-full transition-transform duration-200 md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SidebarContent />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 bg-slate-800 flex-col h-full shrink-0">
        <SidebarContent />
      </aside>
    </>
  )
}
