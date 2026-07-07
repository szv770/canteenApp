'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { RefreshCw, Check, X, Edit2, Copy, ExternalLink } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash', zelle: 'Zelle', credit_card: 'Credit Card', check: 'Check', other: 'Other'
}

export default function TopupRequestsPage() {
  const supabase = createClient()
  const [requests, setRequests] = useState<any[]>([])
  const [bochurim, setBochurim] = useState<any[]>([])
  const [statusFilter, setStatusFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [editRequest, setEditRequest] = useState<any | null>(null)

  useEffect(() => { loadData() }, [statusFilter])

  useEffect(() => {
    supabase.from('bochurim_with_id').select('id, name, bochur_id').eq('archived', false).order('name')
      .then(({ data }) => setBochurim(data || []))
  }, [])

  async function loadData() {
    setLoading(true)
    let q = supabase
      .from('topup_requests')
      .select('*, bochurim!bochur_id(name, bochur_id)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (statusFilter !== 'all') q = q.eq('status', statusFilter)
    const { data, error } = await q
    if (error) toast.error(error.message)
    setRequests(data || [])
    setLoading(false)
  }

  async function approve(req: any, amount: number, adminNotes: string) {
    const { error: updateErr } = await supabase.from('topup_requests')
      .update({ status: 'approved', amount, admin_notes: adminNotes || null, reviewed_at: new Date().toISOString() })
      .eq('id', req.id)
    if (updateErr) { toast.error(updateErr.message); return }

    if (req.bochur_id) {
      const res = await fetch('/api/admin/bochur-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bochur_id: req.bochur_id, amount, method: req.method, note: `Topup request approved${adminNotes ? ': ' + adminNotes : ''}` }),
      })
      if (!res.ok) { toast.error('Approved but failed to credit balance — do it manually'); }
      else toast.success(`Approved & credited ${formatCurrency(amount)} to account`)
    } else {
      toast.success('Request approved (no account linked)')
    }
    setEditRequest(null)
    loadData()
  }

  async function reject(id: string, adminNotes: string) {
    const { error } = await supabase.from('topup_requests')
      .update({ status: 'rejected', admin_notes: adminNotes || null, reviewed_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Request rejected')
    setEditRequest(null)
    loadData()
  }

  function copyLink(bochurId: string) {
    const url = `${window.location.origin}/topup-request/${bochurId}`
    navigator.clipboard.writeText(url)
    toast.success('Link copied!')
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Topup Requests</h1>
          <p className="text-slate-500 text-sm mt-1">
            {pendingCount > 0 ? <span className="text-amber-600 font-semibold">{pendingCount} pending</span> : 'No pending requests'}
          </p>
        </div>
        <button onClick={loadData} className="btn-secondary text-sm"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {/* Link generator */}
      <div className="admin-card p-4 mb-5">
        <p className="text-sm font-semibold text-slate-700 mb-3">Share a personal topup link with a parent</p>
        <div className="flex flex-wrap gap-2">
          {bochurim.slice(0, 20).map(b => (
            <button key={b.id} onClick={() => copyLink(b.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-xs hover:bg-amber-50 hover:border-amber-300 transition-colors">
              <span>{b.name}</span>
              <Copy className="w-3 h-3 text-slate-400" />
            </button>
          ))}
          {bochurim.length > 20 && <span className="text-xs text-slate-400 self-center">+{bochurim.length - 20} more — use the bochurim page to find their link</span>}
        </div>
        <p className="text-xs text-slate-400 mt-2">Also works without a student link — parents can go to <code className="bg-slate-100 px-1 rounded">/topup-request</code> directly</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4">
        {['pending', 'approved', 'rejected', 'all'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${statusFilter === s ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
            {s}
          </button>
        ))}
      </div>

      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Date</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Parent</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Student</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Method</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Amount</th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Status</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">Loading...</td></tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">No requests</td></tr>
              ) : requests.map(req => (
                <tr key={req.id} className="table-row">
                  <td className="px-4 py-3 text-sm text-slate-500">{format(new Date(req.created_at), 'MM/dd HH:mm')}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-900">{req.parent_name || <span className="text-slate-400">—</span>}</p>
                    {req.parent_notes && <p className="text-xs text-slate-400 truncate max-w-[140px]">{req.parent_notes}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{req.bochurim?.name || <span className="text-slate-400">Walk-in</span>}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{METHOD_LABELS[req.method] || req.method}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-900 text-right">{formatCurrency(req.amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`badge border ${STATUS_COLORS[req.status] || ''}`}>{req.status}</span>
                    {req.admin_notes && <p className="text-xs text-slate-400 mt-0.5 max-w-[120px] mx-auto truncate">{req.admin_notes}</p>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {req.status === 'pending' && (
                      <button onClick={() => setEditRequest(req)} className="btn-secondary text-xs py-1 px-2.5">
                        <Edit2 className="w-3 h-3" /> Review
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editRequest && (
        <ReviewModal
          request={editRequest}
          onClose={() => setEditRequest(null)}
          onApprove={approve}
          onReject={reject}
        />
      )}
    </div>
  )
}

function ReviewModal({ request, onClose, onApprove, onReject }: {
  request: any
  onClose: () => void
  onApprove: (req: any, amount: number, notes: string) => void
  onReject: (id: string, notes: string) => void
}) {
  const [amount, setAmount] = useState(String(request.amount))
  const [adminNotes, setAdminNotes] = useState(request.admin_notes || '')
  const [saving, setSaving] = useState(false)

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Review Request</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="p-3 bg-slate-50 rounded-xl space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">From</span><span className="font-medium">{request.parent_name || '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Student</span><span className="font-medium">{request.bochurim?.name || 'Walk-in'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Method</span><span className="font-medium capitalize">{request.method}</span></div>
            {request.parent_notes && <div className="pt-1 text-slate-500 border-t border-slate-200">"{request.parent_notes}"</div>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount</label>
            <input type="number" className="input-admin text-lg font-semibold" value={amount} onChange={e => setAmount(e.target.value)} step={0.5} min={0.01} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Admin notes (optional)</label>
            <input className="input-admin" value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="Received Zelle from..." />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={async () => { setSaving(true); await onReject(request.id, adminNotes) }}
              disabled={saving}
              className="btn-secondary flex-1 text-red-600 hover:bg-red-50">
              <X className="w-4 h-4" /> Reject
            </button>
            <button
              onClick={async () => { const amt = parseFloat(amount); if (!amt || amt <= 0) { toast.error('Valid amount required'); return } setSaving(true); await onApprove(request, amt, adminNotes) }}
              disabled={saving}
              className="btn-primary flex-1">
              <Check className="w-4 h-4" /> Approve & Credit
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
