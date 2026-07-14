'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { X, UserCog } from 'lucide-react'

interface Props {
  cashierId: string
  onClose: () => void
}

interface CashierRow {
  id: string
  name: string
  role: 'admin' | 'cashier'
  is_active: boolean
  tip_balance: number | null
  bochur_id: string | null
  created_at: string
}

export default function CashierQuickViewModal({ cashierId, onClose }: Props) {
  const supabase = createClient()
  const [cashier, setCashier] = useState<CashierRow | null>(null)
  const [linkedBochurName, setLinkedBochurName] = useState<string | null>(null)
  const [stats, setStats] = useState<{ orders: number; revenue: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    async function load() {
      const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const { data: c } = await supabase.from('cashier_profiles').select('*').eq('id', cashierId).single()
      if (cancelled) return
      setCashier(c as CashierRow)

      const [{ data: orders }, bochurRes] = await Promise.all([
        supabase.from('orders').select('total').eq('cashier_id', cashierId).eq('status', 'completed')
          .gte('created_at', thirtyDaysAgo.toISOString()),
        (c as any)?.bochur_id
          ? supabase.from('bochurim').select('name').eq('id', (c as any).bochur_id).single()
          : Promise.resolve({ data: null }),
      ])
      if (cancelled) return
      setStats({
        orders: (orders || []).length,
        revenue: (orders || []).reduce((s: number, o: any) => s + Number(o.total), 0),
      })
      setLinkedBochurName((bochurRes as any)?.data?.name || null)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [cashierId])

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <UserCog className="w-4 h-4 text-slate-400 shrink-0" />
            <h2 className="font-bold text-slate-900 truncate">{cashier?.name || 'Cashier'}</h2>
          </div>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-slate-100 rounded-xl shrink-0">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading…</div>
        ) : !cashier ? (
          <div className="p-8 text-center text-sm text-slate-400">Cashier not found (may have been deleted).</div>
        ) : (
          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                cashier.role === 'admin' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'
              }`}>
                {cashier.role === 'admin' ? 'Admin' : 'Cashier'}
              </span>
              {!cashier.is_active && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">Inactive</span>
              )}
              {linkedBochurName && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600">
                  Linked: {linkedBochurName}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Orders (30d)</p>
                <p className="font-bold text-slate-800">{stats?.orders ?? '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Revenue (30d)</p>
                <p className="font-bold text-slate-800">{stats ? formatCurrency(stats.revenue) : '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Tip Balance</p>
                <p className="font-bold text-slate-800">{formatCurrency(cashier.tip_balance || 0)}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Since</p>
                <p className="font-bold text-slate-800">{new Date(cashier.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
