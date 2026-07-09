'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RefreshCw, Check, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export default function RefundRequestsPage() {
  const supabase = createClient()
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('refund_requests')
      .select('*, orders!order_id(order_number, total, bochur_id), cashier_profiles!requested_by(name)')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) toast.error('Failed to load refund requests: ' + error.message)
    setRequests(data || [])
    setLoading(false)
  }

  async function approve(req: any) {
    if (processingId) return
    if (!confirm(`Approve refund of ${formatCurrency(req.amount)} for order #${req.orders?.order_number}?`)) return
    setProcessingId(req.id)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // 1. Mark request approved
      const { error: reqErr } = await supabase
        .from('refund_requests')
        .update({ status: 'approved', resolved_by: user?.id ?? null, resolved_at: new Date().toISOString() })
        .eq('id', req.id)
      if (reqErr) throw reqErr

      // 2/3. Credit the bochur balance + ledger entry if order has a bochur
      const bochurId = req.orders?.bochur_id
      if (bochurId) {
        const { data: bochur, error: bErr } = await supabase
          .from('bochurim').select('balance').eq('id', bochurId).single()
        if (bErr) throw bErr
        const { error: balErr } = await supabase
          .from('bochurim')
          .update({ balance: (bochur?.balance || 0) + req.amount })
          .eq('id', bochurId)
        if (balErr) throw balErr

        const { error: ledgerErr } = await supabase.from('balance_ledger').insert({
          bochur_id: bochurId,
          amount: req.amount,
          type: 'refund',
          order_id: req.order_id,
          cashier_id: user?.id ?? null,
          note: `Refund approved for order #${req.orders?.order_number}`,
        })
        if (ledgerErr) throw ledgerErr
      }

      // 4. Mark order refunded
      const { error: ordErr } = await supabase
        .from('orders').update({ status: 'refunded' }).eq('id', req.order_id)
      if (ordErr) throw ordErr

      toast.success(bochurId ? 'Refund approved & balance credited' : 'Refund approved')
      load()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to approve refund')
    } finally {
      setProcessingId(null)
    }
  }

  async function reject(req: any) {
    if (processingId) return
    setProcessingId(req.id)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('refund_requests')
        .update({
          status: 'rejected',
          resolved_by: user?.id ?? null,
          resolved_at: new Date().toISOString(),
          resolution_note: rejectNote.trim() || null,
        })
        .eq('id', req.id)
      if (error) throw error
      toast.success('Refund request rejected')
      setRejectingId(null)
      setRejectNote('')
      load()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reject refund')
    } finally {
      setProcessingId(null)
    }
  }

  const pending = requests.filter(r => r.status === 'pending')
  const resolved = requests.filter(r => r.status !== 'pending')

  const statusBadge: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700 border border-amber-100',
    approved: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
    rejected: 'bg-red-50 text-red-600 border border-red-100',
  }

  function Row({ r }: { r: any }) {
    return (
      <>
        <tr className={`table-row ${r.status === 'pending' ? 'bg-amber-50/40' : ''}`}>
          <td className="px-5 py-3 text-sm text-slate-500">{format(new Date(r.created_at), 'MM/dd HH:mm')}</td>
          <td className="px-5 py-3 text-sm font-semibold text-slate-900">#{r.orders?.order_number ?? '—'}</td>
          <td className="px-5 py-3 text-sm font-bold text-slate-900">{formatCurrency(r.amount)}</td>
          <td className="px-5 py-3 text-sm text-slate-700 max-w-xs truncate" title={r.reason}>{r.reason}</td>
          <td className="px-5 py-3 text-sm text-slate-700">{r.cashier_profiles?.name || '—'}</td>
          <td className="px-5 py-3 text-center"><span className={`badge ${statusBadge[r.status] || 'bg-slate-100 text-slate-500'}`}>{r.status}</span></td>
          <td className="px-5 py-3 text-right">
            {r.status === 'pending' ? (
              <div className="flex items-center justify-end gap-1.5">
                <button
                  onClick={() => approve(r)}
                  disabled={processingId === r.id}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" /> Approve
                </button>
                <button
                  onClick={() => { setRejectingId(rejectingId === r.id ? null : r.id); setRejectNote('') }}
                  disabled={processingId === r.id}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" /> Reject
                </button>
              </div>
            ) : (
              <span className="text-xs text-slate-400">
                {r.resolved_at ? format(new Date(r.resolved_at), 'MM/dd HH:mm') : ''}
                {r.resolution_note ? ` — ${r.resolution_note}` : ''}
              </span>
            )}
          </td>
        </tr>
        {rejectingId === r.id && (
          <tr className="bg-red-50/30">
            <td colSpan={7} className="px-5 py-3">
              <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                <input
                  value={rejectNote}
                  onChange={e => setRejectNote(e.target.value)}
                  placeholder="Reason for rejection (optional)"
                  className="input-admin flex-1"
                />
                <div className="flex gap-2">
                  <button onClick={() => reject(r)} disabled={processingId === r.id} className="btn-danger text-sm whitespace-nowrap disabled:opacity-50">Confirm Reject</button>
                  <button onClick={() => { setRejectingId(null); setRejectNote('') }} className="btn-secondary text-sm">Cancel</button>
                </div>
              </div>
            </td>
          </tr>
        )}
      </>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Refund Requests</h1>
          <p className="text-slate-500 text-sm mt-1">{pending.length} pending · {requests.length} total</p>
        </div>
        <button onClick={load} className="btn-secondary text-sm"><RefreshCw className="w-4 h-4" /></button>
      </div>

      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Date</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Order #</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Amount</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Reason</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Requested By</th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Status</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400 text-sm">Loading...</td></tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400 text-sm">No refund requests</td></tr>
              ) : (
                <>
                  {pending.map(r => <Row key={r.id} r={r} />)}
                  {resolved.map(r => <Row key={r.id} r={r} />)}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
