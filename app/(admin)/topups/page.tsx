'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RefreshCw, Check, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export default function TopupsPage() {
  const supabase = createClient()
  const [topups, setTopups] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadTopups() }, [])

  async function loadTopups() {
    setLoading(true)
    const { data } = await supabase
      .from('balance_topups')
      .select('*, bochurim(name)')
      .order('created_at', { ascending: false })
      .limit(100)
    setTopups(data || [])
    setLoading(false)
  }

  async function confirm(topup: any) {
    const { data: bochur } = await supabase.from('bochurim').select('balance').eq('id', topup.bochur_id).single()
    if (!bochur) return
    await supabase.from('bochurim').update({ balance: bochur.balance + topup.amount }).eq('id', topup.bochur_id)
    await supabase.from('balance_ledger').insert({
      bochur_id: topup.bochur_id, amount: topup.amount, type: 'topup',
      note: `${topup.method} top-up confirmed`, reference_id: topup.id,
    })
    await supabase.from('balance_topups').update({ status: 'confirmed' }).eq('id', topup.id)
    toast.success('Top-up confirmed and credited!')
    loadTopups()
  }

  async function reject(id: string) {
    await supabase.from('balance_topups').update({ status: 'rejected' }).eq('id', id)
    toast.success('Top-up rejected')
    loadTopups()
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    confirmed: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-600',
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Balance Top-ups</h1>
          <p className="text-gray-500 text-sm mt-1">Manage parent payment requests</p>
        </div>
        <button onClick={loadTopups} className="btn-secondary text-sm"><RefreshCw className="w-4 h-4" /> Refresh</button>
      </div>

      <div className="admin-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Bochur</th>
              <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Amount</th>
              <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Method</th>
              <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Date</th>
              <th className="text-center text-xs font-medium text-gray-400 px-5 py-3">Status</th>
              <th className="text-right text-xs font-medium text-gray-400 px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">Loading...</td></tr>
            ) : topups.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">No top-up requests</td></tr>
            ) : topups.map(t => (
              <tr key={t.id} className="table-row">
                <td className="px-5 py-3 text-sm font-medium text-gray-900">{t.bochurim?.name || '—'}</td>
                <td className="px-5 py-3 text-sm font-semibold text-emerald-600">{formatCurrency(t.amount)}</td>
                <td className="px-5 py-3 text-sm text-gray-500 capitalize">{t.method}</td>
                <td className="px-5 py-3 text-sm text-gray-400">{format(new Date(t.created_at), 'MM/dd HH:mm')}</td>
                <td className="px-5 py-3 text-center">
                  <span className={`badge ${statusColors[t.status] || 'bg-gray-100 text-gray-500'}`}>{t.status}</span>
                </td>
                <td className="px-5 py-3 text-right">
                  {t.status === 'pending' && (
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => confirm(t)} className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors" title="Confirm">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => reject(t.id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors" title="Reject">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
