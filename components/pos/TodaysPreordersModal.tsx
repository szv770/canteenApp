'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { X, Search, Check, Clock, Truck, ChefHat } from 'lucide-react'
import toast from 'react-hot-toast'
import { localDateStrInTz } from '@/lib/preorderCutoff'

interface Props {
  onClose: () => void
}

interface Row {
  id: string
  bochur_name: string
  total_amount: number
  is_staff_pricing: boolean
  items: { product_name: string; quantity: number; preorder_source: 'vendor' | 'in_house' }[]
}

// Cashier-facing counterpart to the admin Preorders → Orders tab's "Confirm
// Received" action. Reuses the exact same /api/pos/preorder-confirm route
// (balance/frozen/negative-balance checks live there, untouched) — this
// component is purely a POS-side view + one-tap trigger for it, since
// cashiers are the ones physically handing food over at the counter.
export default function TodaysPreordersModal({ onClose }: Props) {
  const supabase = createClient()
  const [date, setDate] = useState(localDateStrInTz(new Date()))
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  useEffect(() => { loadData() }, [date])

  async function loadData() {
    setLoading(true)
    const { data, error } = await supabase
      .from('preorders')
      .select('id, is_staff_pricing, total_amount, bochurim!bochur_id(name), preorder_items(product_name, quantity, preorder_source)')
      .eq('for_date', date)
      .eq('status', 'pending')
      .order('created_at')
    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }
    setRows((data || []).map((r: any) => ({
      id: r.id,
      bochur_name: r.bochurim?.name || 'Unknown',
      total_amount: Number(r.total_amount),
      is_staff_pricing: r.is_staff_pricing,
      items: r.preorder_items || [],
    })))
    setLoading(false)
  }

  const filtered = rows.filter(r => r.bochur_name.toLowerCase().includes(search.toLowerCase()))

  async function confirmReceived(id: string, name: string) {
    setConfirmingId(id)
    try {
      const res = await fetch('/api/pos/preorder-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preorder_id: id }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error === 'Insufficient balance'
          ? `${name} is short ${formatCurrency(json.shortfall)} — top up first`
          : (json.error || 'Failed to confirm'))
        return
      }
      toast.success(`Charged ${formatCurrency(json.charged)} to ${name}`)
      setRows(prev => prev.filter(r => r.id !== id))
    } finally {
      setConfirmingId(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <p className="font-bold text-slate-900 text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" /> Today's Preorders
            </p>
            <p className="text-slate-400 text-sm">Tap Confirm once the item is handed over — this is what charges the balance</p>
          </div>
          <button onClick={onClose} className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="px-5 pt-4 flex items-center gap-2 shrink-0">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
          />
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-8">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              {rows.length === 0 ? 'No pending preorders for this date' : 'No match for that name'}
            </p>
          ) : filtered.map(r => (
            <div key={r.id} className="p-3 border border-slate-100 rounded-xl">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-semibold text-slate-900 text-sm">{r.bochur_name}</span>
                {r.is_staff_pricing && <span className="badge bg-purple-50 text-purple-700 border border-purple-100 text-xs">Staff</span>}
              </div>
              <p className="text-xs text-slate-500 mb-2 flex flex-wrap items-center gap-1">
                {r.items.map((i, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1">
                    {i.preorder_source === 'vendor' ? <Truck className="w-3 h-3 text-slate-400" /> : <ChefHat className="w-3 h-3 text-slate-400" />}
                    {i.product_name} ×{i.quantity}{idx < r.items.length - 1 ? ',' : ''}
                  </span>
                ))}
              </p>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">{formatCurrency(r.total_amount)}</span>
                <button
                  onClick={() => confirmReceived(r.id, r.bochur_name)}
                  disabled={confirmingId === r.id}
                  className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  <Check className="w-4 h-4" /> {confirmingId === r.id ? 'Confirming...' : 'Confirm Received'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
