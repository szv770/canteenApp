'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RefreshCw, Check, X, Link as LinkIcon } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export default function TopupsPage() {
  const supabase = createClient()
  const [topups, setTopups] = useState<any[]>([])
  const [bochurim, setBochurim] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [linkBochurId, setLinkBochurId] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [tRes, bRes] = await Promise.all([
      supabase
        .from('balance_topups')
        .select('*, bochurim(name)')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('bochurim').select('id,name').eq('archived', false).order('name'),
    ])
    setTopups(tRes.data || [])
    setBochurim(bRes.data || [])
    setLoading(false)
  }

  async function confirm(topup: any) {
    if (!topup.bochur_id) {
      toast.error('Link to a bochur first before confirming')
      return
    }
    const { data: bochur } = await supabase.from('bochurim').select('balance').eq('id', topup.bochur_id).single()
    if (!bochur) { toast.error('Bochur not found'); return }

    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('bochurim').update({ balance: bochur.balance + topup.amount }).eq('id', topup.bochur_id)
    await supabase.from('balance_ledger').insert({
      bochur_id: topup.bochur_id,
      amount: topup.amount,
      type: 'topup',
      note: `${topup.method} top-up${topup.sender_name ? ` from ${topup.sender_name}` : ''}`,
      cashier_id: user?.id ?? null,
    })
    await supabase.from('balance_topups').update({
      status: 'confirmed',
      confirmed_by: user?.id ?? null,
      confirmed_at: new Date().toISOString(),
    }).eq('id', topup.id)

    toast.success('Top-up confirmed and credited!')
    loadAll()
  }

  async function reject(id: string) {
    if (!confirm('Reject this top-up request?')) return
    await supabase.from('balance_topups').update({ status: 'rejected' }).eq('id', id)
    toast.success('Top-up rejected')
    loadAll()
  }

  async function saveLink(topupId: string) {
    if (!linkBochurId) { toast.error('Select a bochur'); return }
    await supabase.from('balance_topups').update({ bochur_id: linkBochurId }).eq('id', topupId)
    toast.success('Linked to bochur')
    setLinkingId(null)
    setLinkBochurId('')
    loadAll()
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    confirmed: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-600',
  }

  const pending = topups.filter(t => t.status === 'pending')
  const rest = topups.filter(t => t.status !== 'pending')

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Balance Top-ups</h1>
          <p className="text-gray-500 text-sm mt-1">
            {pending.length > 0 && <span className="text-amber-600 font-semibold">{pending.length} pending · </span>}
            Parent payment requests
          </p>
        </div>
        <button onClick={loadAll} className="btn-secondary text-sm"><RefreshCw className="w-4 h-4" /> Refresh</button>
      </div>

      <div className="admin-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Parent / Student</th>
              <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Bochur Account</th>
              <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Amount</th>
              <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Method</th>
              <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Date</th>
              <th className="text-center text-xs font-medium text-gray-400 px-5 py-3">Status</th>
              <th className="text-right text-xs font-medium text-gray-400 px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400">Loading...</td></tr>
            ) : topups.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400">No top-up requests yet</td></tr>
            ) : [...pending, ...rest].map(t => (
              <tr key={t.id} className="table-row">
                <td className="px-5 py-3">
                  <p className="text-sm font-medium text-gray-900">{t.student_name || '—'}</p>
                  <p className="text-xs text-gray-400">from {t.sender_name || '—'}</p>
                  {t.transaction_ref && <p className="text-xs text-gray-400 font-mono">ref: {t.transaction_ref}</p>}
                  {t.notes && <p className="text-xs text-gray-400 italic">{t.notes}</p>}
                </td>
                <td className="px-5 py-3">
                  {linkingId === t.id ? (
                    <div className="flex items-center gap-1">
                      <select
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand"
                        value={linkBochurId}
                        onChange={e => setLinkBochurId(e.target.value)}
                      >
                        <option value="">Select bochur...</option>
                        {bochurim.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      <button onClick={() => saveLink(t.id)} className="text-xs bg-brand text-white px-2 py-1.5 rounded-lg font-medium">Save</button>
                      <button onClick={() => setLinkingId(null)} className="text-xs text-gray-400 hover:text-gray-600 px-1">✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setLinkingId(t.id); setLinkBochurId(t.bochur_id || '') }}
                      className={`flex items-center gap-1 text-xs rounded-lg px-2 py-1 transition-colors ${t.bochurim?.name ? 'text-gray-700 hover:bg-gray-100' : 'text-amber-600 bg-amber-50 hover:bg-amber-100'}`}
                    >
                      <LinkIcon className="w-3 h-3" />
                      {t.bochurim?.name || 'Link bochur'}
                    </button>
                  )}
                </td>
                <td className="px-5 py-3 text-sm font-semibold text-emerald-600">{formatCurrency(t.amount)}</td>
                <td className="px-5 py-3 text-sm text-gray-500 capitalize">{t.method}</td>
                <td className="px-5 py-3 text-xs text-gray-400">{format(new Date(t.created_at), 'MM/dd h:mm a')}</td>
                <td className="px-5 py-3 text-center">
                  <span className={`badge ${statusColors[t.status] || 'bg-gray-100 text-gray-500'}`}>{t.status}</span>
                </td>
                <td className="px-5 py-3 text-right">
                  {t.status === 'pending' && (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => confirm(t)}
                        className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Confirm & credit"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => reject(t.id)}
                        className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                        title="Reject"
                      >
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
