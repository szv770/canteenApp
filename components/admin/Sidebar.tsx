'use client'

import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Users, Package, Tag, Warehouse,
  Receipt, Settings, CreditCard, ShoppingBag, LogOut
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
  { href: '/settings', icon: Settings, label: 'Settings' },
]

export default function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-56 bg-admin-sidebar flex flex-col h-full shrink-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
            <ShoppingBag className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm">Canteen POS</p>
            <p className="text-slate-400 text-xs">Admin Panel</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {NAV.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
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
          onClick={() => router.push('/pos')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-white/10 hover:text-white transition-all"
        >
          <ShoppingBag className="w-4 h-4" />
          Go to POS
        </button>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
