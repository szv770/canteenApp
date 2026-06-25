'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ShoppingBag, DollarSign, Send, Check, ChevronRight, Smartphone } from 'lucide-react'
import toast from 'react-hot-toast'

const METHOD_LABELS: Record<string, string> = {
  zelle: 'Zelle',
  venmo: 'Venmo',
  paypal: 'PayPal',
  cash: 'Cash / Check',
}

interface Props {
  loggedIn: boolean
  settings: Record<string, string>
}

export default function LandingClient({ loggedIn, settings }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const canteenName = settings['canteen_name'] || 'Yeshiva Canteen'
  const tagline = settings['canteen_tagline'] || 'Easy online top-ups for your son\'s canteen account'

  const enabledMethods = ['zelle', 'venmo', 'paypal', 'cash'].filter(
    m => settings[`payment_${m}_enabled`] === 'true'
  )

  const [step, setStep] = useState<'form' | 'success'>('form')
  const [form, setForm] = useState({
    parentName: '',
    parentPhone: '',
    parentEmail: '',
    studentName: '',
    amount: '',
    method: enabledMethods[0] || 'zelle',
    transactionRef: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)

  function set(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.parentName.trim()) { toast.error('Please enter your name'); return }
    if (!form.studentName.trim()) { toast.error("Please enter your son's name"); return }
    if (!form.parentPhone.trim()) { toast.error('Please enter your phone number'); return }
    if (!form.parentEmail.trim()) { toast.error('Please enter your email'); return }
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return }

    setSubmitting(true)
    const { error } = await supabase.from('balance_topups').insert({
      amount: amt,
      method: form.method,
      sender_name: form.parentName.trim(),
      parent_phone: form.parentPhone.trim() || null,
      parent_email: form.parentEmail.trim() || null,
      student_name: form.studentName.trim(),
      transaction_ref: form.transactionRef.trim() || null,
      notes: form.notes.trim() || null,
      status: 'pending',
    })
    setSubmitting(false)

    if (error) {
      toast.error('Failed to submit. Please try again.')
      return
    }
    setStep('success')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50">
      {/* Nav */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center">
              <ShoppingBag className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">{canteenName}</span>
          </div>
          {loggedIn ? (
            <button
              onClick={() => router.push('/pos')}
              className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
            >
              Go to POS <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => router.push('/login')}
              className="text-sm text-gray-500 hover:text-gray-800 font-medium transition-colors"
            >
              Staff Login
            </button>
          )}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-semibold mb-4">
            <Smartphone className="w-3.5 h-3.5" /> Parent Portal
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-3 leading-tight">
            {canteenName}
          </h1>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">{tagline}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          {/* Payment instructions */}
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-gray-900">How to add funds</h2>
            <div className="space-y-3">
              {[
                { n: '1', title: 'Send payment', desc: 'Use one of the payment methods below to send money.' },
                { n: '2', title: 'Fill out the form', desc: "Submit the form on the right with your son's name and the amount sent." },
                { n: '3', title: 'Funds added', desc: "We'll confirm and credit your son's account, usually within a few hours." },
              ].map(step => (
                <div key={step.n} className="flex items-start gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                  <div className="w-7 h-7 bg-amber-400 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
                    {step.n}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{step.title}</p>
                    <p className="text-gray-500 text-sm mt-0.5">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Payment method cards */}
            {enabledMethods.filter(m => m !== 'cash').length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Send payment to</h3>
                <div className="space-y-2">
                  {enabledMethods.filter(m => m !== 'cash').map(method => {
                    const info = settings[`payment_${method}_info`]
                    if (!info) return null
                    return (
                      <div key={method} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                        <div>
                          <p className="font-semibold text-gray-900">{METHOD_LABELS[method]}</p>
                          <p className="text-amber-600 font-mono text-sm mt-0.5">{info}</p>
                        </div>
                        <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                          <DollarSign className="w-5 h-5 text-amber-500" />
                        </div>
                      </div>
                    )
                  })}
                  {settings['payment_cash_enabled'] === 'true' && (
                    <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                      <p className="font-semibold text-gray-900">Cash / Check</p>
                      <p className="text-sm text-gray-500 mt-0.5">Send in with your son or bring in person</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Form */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            {step === 'success' ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-emerald-500" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Request Submitted!</h3>
                <p className="text-gray-500 text-sm max-w-xs mx-auto">
                  We received your top-up request for <strong>{form.studentName}</strong>.
                  Funds will be added to their account shortly.
                </p>
                <button
                  onClick={() => { setStep('form'); setForm(f => ({ ...f, parentName: '', studentName: '', amount: '', transactionRef: '', notes: '' })) }}
                  className="mt-6 text-sm text-amber-600 font-medium hover:underline"
                >
                  Submit another request
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-bold text-gray-900 mb-5">Request a Top-up</h2>
                <form onSubmit={submit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Your Name *</label>
                      <input
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
                        placeholder="Parent's name"
                        value={form.parentName}
                        onChange={e => set('parentName', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Son's Name *</label>
                      <input
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
                        placeholder="Student's name"
                        value={form.studentName}
                        onChange={e => set('studentName', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Your Phone *</label>
                      <input
                        type="tel"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
                        placeholder="(555) 000-0000"
                        value={form.parentPhone}
                        onChange={e => set('parentPhone', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Your Email *</label>
                      <input
                        type="email"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
                        placeholder="you@example.com"
                        value={form.parentEmail}
                        onChange={e => set('parentEmail', e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount Sent *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                      <input
                        type="number"
                        className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
                        placeholder="0.00"
                        min="1"
                        step="0.01"
                        value={form.amount}
                        onChange={e => set('amount', e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method *</label>
                    <select
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all bg-white"
                      value={form.method}
                      onChange={e => set('method', e.target.value)}
                    >
                      {enabledMethods.map(m => (
                        <option key={m} value={m}>{METHOD_LABELS[m]}</option>
                      ))}
                    </select>
                  </div>

                  {form.method !== 'cash' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Confirmation / Reference # <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
                        placeholder="Transaction ID or last 4 digits"
                        value={form.transactionRef}
                        onChange={e => set('transactionRef', e.target.value)}
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <textarea
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all resize-none"
                      rows={2}
                      placeholder="Any extra info..."
                      value={form.notes}
                      onChange={e => set('notes', e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 bg-amber-400 hover:bg-amber-500 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
                  >
                    {submitting ? (
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {submitting ? 'Submitting...' : 'Submit Request'}
                  </button>

                  <p className="text-xs text-gray-400 text-center">
                    Funds are credited once an admin verifies your payment.
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-100 mt-16 py-6 text-center text-sm text-gray-400">
        {canteenName} · Powered by Canteen POS
      </footer>
    </div>
  )
}
