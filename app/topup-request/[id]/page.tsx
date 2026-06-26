'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { CheckCircle } from 'lucide-react'

const METHODS = [
  { value: 'zelle', label: 'Zelle' },
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'other', label: 'Other' },
]

export default function TopupRequestPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [bochur, setBochur] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    parent_name: '',
    amount: '',
    method: 'zelle',
    parent_notes: '',
  })
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('bochurim').select('id, name').eq('id', params.id).single()
      .then(({ data }) => { setBochur(data); setLoading(false) })
  }, [params.id])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) { setError('Please enter a valid amount'); return }
    setError('')
    setSubmitting(true)

    const res = await fetch('/api/topup-request/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bochur_id: bochur?.id || null,
        parent_name: form.parent_name.trim() || null,
        amount,
        method: form.method,
        parent_notes: form.parent_notes.trim() || null,
      }),
    })

    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error || 'Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }

    setSubmitted(true)
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-sm w-full text-center">
          <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">Request Submitted!</h1>
          <p className="text-slate-500 text-sm">
            Your top-up request of <span className="font-semibold text-slate-700">{formatCurrency(parseFloat(form.amount))}</span> has been received.
            {bochur && <> It will be reviewed and credited to <span className="font-semibold text-slate-700">{bochur.name}</span>'s account soon.</>}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 w-full max-w-sm">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 text-center">
          <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center mx-auto mb-3 text-2xl shadow-sm">
            🛒
          </div>
          <h1 className="text-lg font-bold text-slate-900">Canteen Top-up</h1>
          {bochur ? (
            <p className="text-slate-500 text-sm mt-1">For <span className="font-semibold text-slate-700">{bochur.name}</span></p>
          ) : (
            <p className="text-slate-500 text-sm mt-1">Submit a balance top-up request</p>
          )}
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Your Name</label>
            <input
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all"
              placeholder="Parent / guardian name"
              value={form.parent_name}
              onChange={e => setForm(f => ({ ...f, parent_name: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
              <input
                type="number"
                required
                min={1}
                step={0.5}
                className="w-full pl-7 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all"
                placeholder="0.00"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
            <div className="flex flex-wrap gap-2">
              {METHODS.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, method: m.value }))}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${form.method === m.value ? 'bg-amber-400 text-white border-amber-400' : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300'}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all resize-none"
              rows={2}
              placeholder="e.g. Sent Zelle to 555-1234"
              value={form.parent_notes}
              onChange={e => setForm(f => ({ ...f, parent_notes: e.target.value }))}
            />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>
      </div>
    </div>
  )
}
