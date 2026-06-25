'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Users, Package, Tag, Warehouse,
  Receipt, Settings, CreditCard, ShoppingBag, LogOut, UserCog, Menu, X
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/bochurim', icon: Users, label: 'Bochurim' },
  { href: '/products', icon: Package, label: 'Products' },
  { href: '/categories', icon: Tag, label: 'Categories' },
  { href: '/inventory', icon: Warehouse, label: 'Inventory' },
  { href: '/transactions', icon: Receipt, label: 'Transactions' },
  { href: '/topups', icon: CreditCard, label: 'Top-ups' },
  { href: '/cashiers', icon: UserCog, label: 'Cashiers' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

export default function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)

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
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
              <ShoppingBag className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">Canteen POS</p>
              <p className="text-slate-400 text-xs">Admin Panel</p>
            </div>
          </div>
          {/* Close button for mobile */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {NAV.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <button
              key={item.href}
              onClick={() => navigate(item.href)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-xl text-sm font-medium transition-all duration-150 min-h-[44px]',
                active
                  ? 'bg-brand text-white'
                  : 'text-slate-400 hover:bg-white/10 hover:text-white'
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* POS link + Sign out */}
      <div className="p-3 border-t border-white/10 space-y-1">
        <button
          onClick={() => navigate('/pos')}
          className="w-full flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-white/10 hover:text-white transition-all min-h-[44px]"
        >
          <ShoppingBag className="w-4 h-4" />
          Go to POS
        </button>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-all min-h-[44px]"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile hamburger button (shown in the main layout header area) */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 left-3 z-30 p-2.5 bg-admin-sidebar text-white rounded-xl shadow-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-admin-sidebar flex flex-col h-full transition-transform duration-200 md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SidebarContent />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 bg-admin-sidebar flex-col h-full shrink-0">
        <SidebarContent />
      </aside>
    </>
  )
}
