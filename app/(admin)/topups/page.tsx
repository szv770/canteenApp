'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RefreshCw, Check, X, Link as LinkIcon, Calendar, Mail, MailCheck, MailX, CheckCheck } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import TableSkeleton from '@/components/admin/TableSkeleton'

const todayDateStr = () => new Date().toISOString().slice(0, 10)

function EmailDot({ label, sent }: { label: string; sent: string | null }) {
  if (sent) {
    return (
      <span title={`${label} email sent ${format(new Date(sent), 'MM/dd h:mm a')}`}
        className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
        <MailCheck className="w-3 h-3" /> {label}
      </span>
    )
  }
  return (
    <span title={`${label} email not sent`}
      className="flex items-center gap-1 text-[10px] text-slate-300 font-medium">
      <MailX className="w-3 h-3" /> {label}
    </span>
  )
}

export default function TopupsPage() {
  const supabase = createClient()
  const [topups, setTopups] = useState<any[]>([])
  const [bochurim, setBochurim] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [linkBochurId, setLinkBochurId] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  // Per-row "Date Received" for the confirm flow — defaults to today
  const [dateReceivedMap, setDateReceivedMap] = useState<Record<string, string>>({})
  // Hide confirmed/rejected rows by default to reduce clutter
  const [showArchived, setShowArchived] = useState(false)
  // Smart name-match suggestions: topupId → best matching bochur
  const [suggestionsMap, setSuggestionsMap] = useState<Record<string, { bochurId: string; bochurName: string; score: number }>>({})
  // Reject modal state
  const [rejectingTopup, setRejectingTopup] = useState<{ id: string; studentName: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [tRes, bRes] = await Promise.all([
      supabase
        .from('balance_topups')
        .select('*, bochurim(name), received_email_sent_at, approved_email_sent_at, rejected_email_sent_at')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('bochurim').select('id,name').eq('archived', false).order('name'),
    ])
    const rows = tRes.data || []
    // Initialize date received map for pending rows that don't have one yet
    const today = todayDateStr()
    const initialDates: Record<string, string> = {}
    rows.filter((t: any) => t.status === 'pending').forEach((t: any) => {
      if (!dateReceivedMap[t.id]) initialDates[t.id] = today
    })
    if (Object.keys(initialDates).length > 0) {
      setDateReceivedMap(prev => ({ ...initialDates, ...prev }))
    }
    setTopups(rows)
    const bList = bRes.data || []
    setBochurim(bList)

    // Compute name-match suggestions for unlinked pending rows
    const newSuggestions: Record<string, { bochurId: string; bochurName: string; score: number }> = {}
    for (const t of rows) {
      if (t.bochur_id || t.status !== 'pending' || !t.student_name) continue
      const queryWords = t.student_name.toLowerCase().trim().split(/\s+/)
      let best: { bochurId: string; bochurName: string; score: number } | null = null
      for (const b of bList) {
        const bWords = (b.name as string).toLowerCase().trim().split(/\s+/)
        const matchCount = queryWords.filter((w: string) => bWords.some((bw: string) => bw.includes(w) || w.includes(bw))).length
        const score = matchCount / Math.max(queryWords.length, bWords.length)
        if (score >= 0.5 && (!best || score > best.score)) {
          best = { bochurId: b.id, bochurName: b.name, score }
        }
      }
      if (best) newSuggestions[t.id] = best
    }
    setSuggestionsMap(newSuggestions)

    setLoading(false)
  }

  async function confirmTopup(topup: any, skipCredit = false) {
    if (!topup.bochur_id) {
      toast.error('Link to a bochur first before confirming')
      return
    }
    // Guard against double-click
    if (confirmingId === topup.id) return
    setConfirmingId(topup.id)

    const paymentReceivedDate = dateReceivedMap[topup.id] || todayDateStr()

    try {
      const res = await fetch('/api/admin/topup-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topup_id: topup.id,
          payment_received_date: paymentReceivedDate,
          ...(skipCredit ? { skip_credit: true } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to confirm top-up')

      toast.success(skipCredit ? 'Marked as approved — balance unchanged' : 'Top-up confirmed and credited!')
      loadAll()
    } catch (err: any) {
      const msg = err?.message || ''
      if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network')) {
        toast.error('Network error — please check your connection and try again', { duration: 5000 })
      } else {
        toast.error(msg || 'Failed to confirm top-up — please try again')
      }
    } finally {
      setConfirmingId(null)
    }
  }

  async function reject(id: string, reason?: string) {
    if (rejectingId === id) return
    setRejectingId(id)
    try {
      const res = await fetch('/api/admin/topup-confirm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topup_id: id, ...(reason ? { reason } : {}) }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed to reject'); return }
      toast.success('Top-up rejected')
      setRejectingTopup(null)
      setRejectReason('')
      loadAll()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reject')
    } finally {
      setRejectingId(null)
    }
  }

  async function saveLink(topupId: string, overrideBochurId?: string) {
    const bochurId = overrideBochurId ?? linkBochurId
    if (!bochurId) { toast.error('Select a bochur'); return }
    const res = await fetch('/api/admin/topup-confirm', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topup_id: topupId, bochur_id: bochurId }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error || 'Failed to link'); return }
    toast.success('Linked to bochur')
    setLinkingId(null)
    setLinkBochurId('')
    loadAll()
  }

  const statusBadge: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700 border border-amber-100',
    confirmed: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
    rejected: 'bg-red-50 text-red-600 border border-red-100',
  }

  const pending = topups.filter(t => t.status === 'pending')
  const rest = topups.filter(t => t.status !== 'pending')
  const displayedTopups = showArchived ? [...pending, ...rest] : pending

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Balance Top-ups</h1>
          <p className="text-slate-500 text-sm mt-1">
            {pending.length > 0 && <span className="text-amber-600 font-semibold">{pending.length} pending · </span>}
            Payment requests from parents and cashiers
            {!showArchived && rest.length > 0 && (
              <span className="text-slate-400"> · {rest.length} processed hidden</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowArchived(v => !v)}
            className="btn-secondary text-sm"
          >
            {showArchived ? 'Hide Processed' : 'Show All'}
          </button>
          <button onClick={loadAll} className="btn-secondary text-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Parent / Student</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Bochur Account</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Amount</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Method</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Submitted</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Date Received</th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Status</th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Emails</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={9} />
              ) : topups.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-12 text-center text-slate-400 text-sm">No top-up requests yet</td></tr>
              ) : displayedTopups.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-12 text-center text-slate-400 text-sm">
                  No pending requests
                  {rest.length > 0 && <> · <button onClick={() => setShowArchived(true)} className="underline hover:text-slate-600">{rest.length} processed row{rest.length !== 1 ? 's' : ''} hidden — click Show All</button></>}
                </td></tr>
              ) : displayedTopups.map(t => (
                <tr key={t.id} className="table-row">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className="text-sm font-semibold text-slate-900">{t.student_name || '—'}</p>
                      {t.created_by ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-100">
                          Cashier
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-100">
                          Parent
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      from {t.created_by ? ((t.cashier_profiles as any)?.name || t.sender_name || 'Cashier') : (t.sender_name || '—')}
                    </p>
                    {t.parent_phone && <p className="text-xs text-slate-400">{t.parent_phone}</p>}
                    {t.parent_email && <p className="text-xs text-slate-400">{t.parent_email}</p>}
                    {t.transaction_ref && <p className="text-xs text-slate-400 font-mono">ref: {t.transaction_ref}</p>}
                    {t.notes && <p className="text-xs text-slate-400 italic">{t.notes}</p>}
                  </td>
                  <td className="px-5 py-3">
                    {linkingId === t.id ? (
                      <div className="flex items-center gap-1.5">
                        <select
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
                          value={linkBochurId}
                          onChange={e => setLinkBochurId(e.target.value)}
                        >
                          <option value="">Select bochur...</option>
                          {bochurim.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                        <button onClick={() => saveLink(t.id)} className="text-xs bg-amber-500 text-white px-2.5 py-1.5 rounded-lg font-semibold">Save</button>
                        <button onClick={() => setLinkingId(null)} className="text-xs text-slate-400 hover:text-slate-600 p-1">✕</button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-start gap-1">
                        <button
                          onClick={() => { setLinkingId(t.id); setLinkBochurId(t.bochur_id || '') }}
                          className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 transition-colors font-medium ${t.bochurim?.name ? 'text-slate-700 hover:bg-slate-100' : 'text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-100'}`}
                        >
                          <LinkIcon className="w-3 h-3" />
                          {t.bochurim?.name || 'Link bochur'}
                        </button>
                        {!t.bochur_id && suggestionsMap[t.id] && (
                          <div className={`flex items-center gap-1.5 text-[10px] rounded-lg px-2 py-1 border ${suggestionsMap[t.id].score >= 0.85 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                            <span>💡 {suggestionsMap[t.id].bochurName}?</span>
                            <button
                              onClick={() => saveLink(t.id, suggestionsMap[t.id].bochurId)}
                              className="font-semibold underline hover:no-underline"
                            >
                              Yes ✓
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm font-bold text-emerald-600">{formatCurrency(t.amount)}</td>
                  <td className="px-5 py-3 text-sm text-slate-500 capitalize">{t.method}</td>
                  <td className="px-5 py-3 text-xs text-slate-400">{format(new Date(t.created_at), 'MM/dd h:mm a')}</td>
                  <td className="px-5 py-3">
                    {t.status === 'pending' ? (
                      // Editable date picker for pending rows — cashier sets the actual date money arrived
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <input
                          type="date"
                          value={dateReceivedMap[t.id] || todayDateStr()}
                          onChange={e => setDateReceivedMap(prev => ({ ...prev, [t.id]: e.target.value }))}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 bg-white"
                        />
                      </div>
                    ) : t.payment_received_date ? (
                      <span className="text-xs text-slate-600">{format(new Date(t.payment_received_date + 'T12:00:00'), 'MM/dd/yyyy')}</span>
                    ) : t.confirmed_at ? (
                      <span className="text-xs text-slate-400">{format(new Date(t.confirmed_at), 'MM/dd/yyyy')}</span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={`badge ${statusBadge[t.status] || 'bg-slate-100 text-slate-500'}`}>{t.status}</span>
                  </td>
                  <td className="px-5 py-3">
                    {t.parent_email ? (
                      <div className="flex flex-col items-center gap-1">
                        <EmailDot label="Received" sent={t.received_email_sent_at} />
                        {t.status === 'confirmed' && <EmailDot label="Approved" sent={t.approved_email_sent_at} />}
                        {t.status === 'rejected' && <EmailDot label="Rejected" sent={t.rejected_email_sent_at} />}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300 block text-center">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {t.status === 'pending' && (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => confirmTopup(t)}
                          disabled={confirmingId === t.id || rejectingId === t.id}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Confirm & credit balance"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Mark as approved without crediting balance?\n\nUse this when you already added the balance manually.')) {
                              confirmTopup(t, true)
                            }
                          }}
                          disabled={confirmingId === t.id || rejectingId === t.id}
                          className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Mark approved — already credited (no balance change)"
                        >
                          <CheckCheck className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setRejectingTopup({ id: t.id, studentName: t.student_name || 'this top-up' })}
                          disabled={confirmingId === t.id || rejectingId === t.id}
                          className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Reject modal */}
      {rejectingTopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-slate-900 mb-1">
              Reject top-up for <span className="text-red-600">{rejectingTopup.studentName}</span>?
            </h3>
            <p className="text-xs text-slate-500 mb-4">The reason will be included in the rejection email if one was provided.</p>

            <div className="flex flex-wrap gap-1.5 mb-3">
              {['Payment not received', 'Duplicate request', 'Wrong amount'].map(preset => (
                <button
                  key={preset}
                  onClick={() => setRejectReason(preset)}
                  className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg px-2.5 py-1 transition-colors"
                >
                  {preset}
                </button>
              ))}
            </div>

            <textarea
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 resize-none"
              rows={3}
              placeholder="e.g. Payment not received, wrong amount, duplicate request..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setRejectingTopup(null); setRejectReason('') }}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => reject(rejectingTopup.id, rejectReason.trim() || undefined)}
                disabled={rejectingId === rejectingTopup.id}
                className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                {rejectingId === rejectingTopup.id ? 'Rejecting…' : 'Reject →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
