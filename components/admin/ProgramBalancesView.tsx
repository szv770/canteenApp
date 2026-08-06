'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import { Printer, X, CheckCircle2 } from 'lucide-react'
import {
  fetchSettlementBalances,
  fetchZelleQueue,
  queueSettlement,
  cancelPendingSettlement,
  confirmSettlement,
  type SettlementBalanceRow,
  type ZelleQueueRow,
} from '@/lib/programSettlements'

// Human labels for program_settlements.method. 'write_off' isn't mentioned in
// the pending-badge copy in the spec (only "Cash"/"Zelle" examples are given)
// but it's a real value SettlementBalanceRow.pending.method can carry, so it
// needs a label too rather than falling back to the raw db value.
const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  zelle: 'Zelle',
  write_off: 'Write-off',
}

const DIRECTION_LABELS: Record<string, string> = {
  refund: 'Refund',
  collection: 'Collect',
  write_off: 'Write-off',
}

export default function ProgramBalancesView({ mode }: { mode: 'admin' | 'readonly' }) {
  const supabase = createClient()
  const [owedToFamilies, setOwedToFamilies] = useState<SettlementBalanceRow[]>([])
  const [owedToCanteen, setOwedToCanteen] = useState<SettlementBalanceRow[]>([])
  const [zelleQueue, setZelleQueue] = useState<ZelleQueueRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    await refetch()
    setLoading(false)
  }

  async function refetch() {
    const [balances, zq] = await Promise.all([
      fetchSettlementBalances(supabase),
      fetchZelleQueue(supabase),
    ])
    setOwedToFamilies(balances.owedToFamilies)
    setOwedToCanteen(balances.owedToCanteen)
    setZelleQueue(zq)
  }

  const familiesTotal = owedToFamilies.reduce((s, r) => s + r.balance, 0)
  const canteenTotal = owedToCanteen.reduce((s, r) => s + Math.abs(r.balance), 0)

  return (
    <>
      {/* Print-only styles — mirrors app/(admin)/menu/page.tsx's approach:
          hide the interactive UI, show a minimal print-only block, force a
          page break between the two lists. */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; }
        }
        .print-only { display: none; }
        .print-page-break { page-break-before: always; }
      `}</style>

      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 no-print">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">End of Program Balances</h1>
            <p className="text-slate-500 text-sm mt-1 max-w-2xl">
              Settle up at the end of the program — refund what&rsquo;s owed back to families, and collect (or write off)
              what students still owe the canteen.
            </p>
          </div>
          {mode === 'admin' && (
            <button
              onClick={() => window.print()}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 text-white text-sm font-medium hover:bg-slate-600 transition-colors disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              Print / Export
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 no-print">
            <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-8 no-print">
            {/* ── Owed to Families / Owed to Canteen ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-700">Owed to Families</h2>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                  {owedToFamilies.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-400">Nobody currently is owed money.</div>
                  ) : (
                    owedToFamilies.map(row => (
                      <FamilyRow key={row.bochurId} row={row} mode={mode} onChanged={refetch} />
                    ))
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-700">Owed to Canteen</h2>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                  {owedToCanteen.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-400">Nobody currently owes money.</div>
                  ) : (
                    owedToCanteen.map(row => (
                      <CanteenRow key={row.bochurId} row={row} mode={mode} onChanged={refetch} />
                    ))
                  )}
                </div>
              </section>
            </div>

            {/* ── Zelle Payout Queue ── */}
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-700">Zelle Payout Queue</h2>
                <p className="text-sm text-slate-400 mt-0.5">
                  Every pending settlement (refund or collection) queued for Zelle — since Zelle has no API, send or
                  collect these manually, then confirm below.
                </p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                {zelleQueue.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-400">Nothing queued for Zelle right now.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50">
                          <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Phone</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Direction</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Note</th>
                          {mode === 'admin' && <th className="px-5 py-3" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {zelleQueue.map(row => (
                          <ZelleQueueRowItem key={row.settlementId} row={row} mode={mode} onChanged={refetch} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      {/* ── Print-only minimal export view ── */}
      {mode === 'admin' && (
        <div className="print-only p-8">
          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-4">Refunds Owed to Families</h2>
            <table className="w-full text-sm">
              <tbody>
                {owedToFamilies.map(row => (
                  <tr key={row.bochurId} className="border-b border-slate-200">
                    <td className="py-1.5">{row.name}{row.bochurDisplayId ? ` (${row.bochurDisplayId})` : ''}</td>
                    <td className="py-1.5 text-right font-medium">{formatCurrency(row.balance)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-800 font-bold">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right">{formatCurrency(familiesTotal)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="print-page-break">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Balances Owed to Canteen</h2>
            <table className="w-full text-sm">
              <tbody>
                {owedToCanteen.map(row => (
                  <tr key={row.bochurId} className="border-b border-slate-200">
                    <td className="py-1.5">{row.name}{row.bochurDisplayId ? ` (${row.bochurDisplayId})` : ''}</td>
                    <td className="py-1.5 text-right font-medium">{formatCurrency(Math.abs(row.balance))}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-800 font-bold">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right">{formatCurrency(canteenTotal)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      )}
    </>
  )
}

// ── Owed to Families row ────────────────────────────────────────────────────

function FamilyRow({
  row, mode, onChanged,
}: { row: SettlementBalanceRow; mode: 'admin' | 'readonly'; onChanged: () => Promise<void> }) {
  const supabase = createClient()
  const [formOpen, setFormOpen] = useState(false)
  const [amount, setAmount] = useState(row.balance.toFixed(2))
  const [method, setMethod] = useState<'cash' | 'zelle'>('cash')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit() {
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt <= 0) { toast.error('Enter a valid amount'); return }
    setSubmitting(true)
    const { error } = await queueSettlement(supabase, {
      bochurId: row.bochurId, direction: 'refund', amount: amt, method, note: note.trim() || null,
    })
    setSubmitting(false)
    if (error) { toast.error('Failed to queue refund: ' + error.message); return }
    toast.success('Refund queued')
    setFormOpen(false)
    setNote('')
    await onChanged()
  }

  async function cancelPending() {
    if (!row.pending) return
    setBusy(true)
    const { error } = await cancelPendingSettlement(supabase, row.pending.id)
    setBusy(false)
    if (error) { toast.error('Failed to cancel: ' + error.message); return }
    toast.success('Pending settlement cancelled')
    await onChanged()
  }

  async function confirmPending() {
    if (!row.pending) return
    setBusy(true)
    const res = await confirmSettlement(row.pending.id)
    setBusy(false)
    if (!res.ok) { toast.error(res.error || 'Failed to confirm'); return }
    toast.success('Refund confirmed')
    await onChanged()
  }

  return (
    <div className="p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-slate-800">
            {row.name}
            {row.bochurDisplayId && <span className="text-slate-400 font-normal"> ({row.bochurDisplayId})</span>}
          </p>
          {row.phone && <p className="text-xs text-slate-400">{row.phone}</p>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-emerald-600">{formatCurrency(row.balance)}</span>
          {mode === 'admin' && !row.pending && !formOpen && (
            <button
              onClick={() => setFormOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            >
              Refund
            </button>
          )}
        </div>
      </div>

      {row.pending && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          <span className="text-xs font-medium text-amber-700">
            Pending: {formatCurrency(row.pending.amount)} via {METHOD_LABELS[row.pending.method] ?? row.pending.method}
            {row.pending.note && <span className="text-amber-500 font-normal"> — {row.pending.note}</span>}
          </span>
          {mode === 'admin' && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={confirmPending}
                disabled={busy}
                className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Confirm Sent
              </button>
              <button
                onClick={cancelPending}
                disabled={busy}
                title="Cancel pending refund"
                className="text-amber-500 hover:text-amber-700 disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'admin' && formOpen && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Amount ($)</label>
              <input
                type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Method</label>
              <select
                value={method} onChange={e => setMethod(e.target.value as 'cash' | 'zelle')}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="cash">Cash</option>
                <option value="zelle">Zelle</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Note <span className="text-slate-300">(optional)</span></label>
            <input
              type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Any extra detail"
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setFormOpen(false)} className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">
              Cancel
            </button>
            <button
              onClick={submit} disabled={submitting}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Queuing…' : 'Queue Refund'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Owed to Canteen row ─────────────────────────────────────────────────────

function CanteenRow({
  row, mode, onChanged,
}: { row: SettlementBalanceRow; mode: 'admin' | 'readonly'; onChanged: () => Promise<void> }) {
  const supabase = createClient()
  const owed = Math.abs(row.balance)
  const [formOpen, setFormOpen] = useState<'collect' | 'writeoff' | null>(null)
  const [amount, setAmount] = useState(owed.toFixed(2))
  const [method, setMethod] = useState<'cash' | 'zelle'>('cash')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [busy, setBusy] = useState(false)

  function openForm(type: 'collect' | 'writeoff') {
    setAmount(owed.toFixed(2))
    setNote('')
    setFormOpen(type)
  }

  async function submitCollect() {
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt <= 0) { toast.error('Enter a valid amount'); return }
    setSubmitting(true)
    const { error } = await queueSettlement(supabase, {
      bochurId: row.bochurId, direction: 'collection', amount: amt, method, note: note.trim() || null,
    })
    setSubmitting(false)
    if (error) { toast.error('Failed to queue collection: ' + error.message); return }
    toast.success('Collection queued')
    setFormOpen(null)
    await onChanged()
  }

  async function submitWriteOff() {
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt <= 0) { toast.error('Enter a valid amount'); return }
    if (!note.trim()) { toast.error('A note explaining the write-off is required'); return }
    setSubmitting(true)
    const { error } = await queueSettlement(supabase, {
      bochurId: row.bochurId, direction: 'write_off', amount: amt, method: 'write_off', note: note.trim(),
    })
    setSubmitting(false)
    if (error) { toast.error('Failed to queue write-off: ' + error.message); return }
    toast.success('Write-off queued')
    setFormOpen(null)
    await onChanged()
  }

  async function cancelPending() {
    if (!row.pending) return
    setBusy(true)
    const { error } = await cancelPendingSettlement(supabase, row.pending.id)
    setBusy(false)
    if (error) { toast.error('Failed to cancel: ' + error.message); return }
    toast.success('Pending settlement cancelled')
    await onChanged()
  }

  async function confirmPending() {
    if (!row.pending) return
    setBusy(true)
    const res = await confirmSettlement(row.pending.id)
    setBusy(false)
    if (!res.ok) { toast.error(res.error || 'Failed to confirm'); return }
    toast.success(row.pending.method === 'write_off' ? 'Write-off confirmed' : 'Collection confirmed')
    await onChanged()
  }

  return (
    <div className="p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-slate-800">
            {row.name}
            {row.bochurDisplayId && <span className="text-slate-400 font-normal"> ({row.bochurDisplayId})</span>}
          </p>
          {row.phone && <p className="text-xs text-slate-400">{row.phone}</p>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-red-600">{formatCurrency(owed)} owed</span>
          {mode === 'admin' && !row.pending && !formOpen && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => openForm('collect')}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Collect
              </button>
              <button
                onClick={() => openForm('writeoff')}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Write Off
              </button>
            </div>
          )}
        </div>
      </div>

      {row.pending && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          <span className="text-xs font-medium text-amber-700">
            Pending: {formatCurrency(row.pending.amount)} via {METHOD_LABELS[row.pending.method] ?? row.pending.method}
            {row.pending.note && <span className="text-amber-500 font-normal"> — {row.pending.note}</span>}
          </span>
          {mode === 'admin' && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={confirmPending}
                disabled={busy}
                className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> {row.pending.method === 'write_off' ? 'Confirm Write-off' : 'Confirm Sent'}
              </button>
              <button
                onClick={cancelPending}
                disabled={busy}
                title="Cancel pending settlement"
                className="text-amber-500 hover:text-amber-700 disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'admin' && formOpen === 'collect' && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Amount ($)</label>
              <input
                type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Method</label>
              <select
                value={method} onChange={e => setMethod(e.target.value as 'cash' | 'zelle')}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="cash">Cash</option>
                <option value="zelle">Zelle</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Note <span className="text-slate-300">(optional)</span></label>
            <input
              type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Any extra detail"
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setFormOpen(null)} className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">
              Cancel
            </button>
            <button
              onClick={submitCollect} disabled={submitting}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Queuing…' : 'Queue Collection'}
            </button>
          </div>
        </div>
      )}

      {mode === 'admin' && formOpen === 'writeoff' && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Amount ($)</label>
            <input
              type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Reason for write-off <span className="text-red-500">(required)</span>
            </label>
            <input
              type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Why is this being written off?"
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setFormOpen(null)} className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">
              Cancel
            </button>
            <button
              onClick={submitWriteOff} disabled={submitting}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-700 text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Queuing…' : 'Queue Write-off'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Zelle queue row ──────────────────────────────────────────────────────────

function ZelleQueueRowItem({
  row, mode, onChanged,
}: { row: ZelleQueueRow; mode: 'admin' | 'readonly'; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    const res = await confirmSettlement(row.settlementId)
    setBusy(false)
    if (!res.ok) { toast.error(res.error || 'Failed to confirm'); return }
    toast.success('Confirmed')
    await onChanged()
  }

  return (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className="px-5 py-3 text-slate-800 font-medium whitespace-nowrap">{row.name}</td>
      <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{row.phone || <span className="text-slate-300">—</span>}</td>
      <td className="px-5 py-3">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          row.direction === 'refund' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
        }`}>
          {DIRECTION_LABELS[row.direction] ?? row.direction}
        </span>
      </td>
      <td className="px-5 py-3 text-right font-semibold text-slate-800 whitespace-nowrap">{formatCurrency(row.amount)}</td>
      <td className="px-5 py-3 text-slate-500 max-w-xs truncate">{row.note || <span className="text-slate-300">—</span>}</td>
      {mode === 'admin' && (
        <td className="px-5 py-3 text-right">
          <button
            onClick={confirm}
            disabled={busy}
            className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50 whitespace-nowrap"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Confirm Sent
          </button>
        </td>
      )}
    </tr>
  )
}
