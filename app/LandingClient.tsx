'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Script from 'next/script'
import Link from 'next/link'
import { ShoppingBag, Send, Check, ChevronRight, Smartphone, Copy, ExternalLink, CreditCard, AlertTriangle, X, Megaphone, Info, FileText, Flame } from 'lucide-react'
import toast from 'react-hot-toast'

const METHOD_LABELS: Record<string, string> = {
  zelle: 'Zelle',
  venmo: 'Venmo',
  paypal: 'PayPal',
  cashapp: 'Cash App',
  cash: 'Cash / Check',
  credit_card: 'Credit Card (Online)',
}

const METHOD_COLORS: Record<string, string> = {
  zelle: '#6D1ED4',
  venmo: '#008CFF',
  paypal: '#003087',
  cashapp: '#00C244',
  cash: '#6B7280',
  credit_card: '#D97706',
}

const METHOD_LOGOS: Record<string, string> = {
  zelle: 'Z',
  venmo: 'V',
  paypal: 'P',
  cashapp: '$',
}

function getPaymentDeepLink(method: string, info: string): string | null {
  const clean = info.trim()
  if (method === 'venmo') {
    const handle = clean.startsWith('@') ? clean.slice(1) : clean
    return `https://venmo.com/${handle}`
  }
  if (method === 'paypal') {
    if (clean.startsWith('http')) return clean
    const handle = clean.startsWith('@') ? clean.slice(1) : clean
    if (handle.includes('@')) return null // email - no link
    return `https://paypal.me/${handle}`
  }
  if (method === 'cashapp') {
    const handle = clean.startsWith('$') ? clean.slice(1) : clean
    return `https://cash.app/$${handle}`
  }
  // Zelle has no universal deep link
  return null
}

async function copyToClipboard(text: string) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      // Fallback for older mobile browsers
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.focus()
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    return true
  } catch {
    return false
  }
}

interface TopSellerItem {
  name: string
  icon: string | null
}

interface HomeAnnouncement {
  id: string
  message: string
  type: 'info' | 'warning' | 'urgent'
}

interface Props {
  loggedIn: boolean
  settings: Record<string, string>
  announcement: HomeAnnouncement | null
  topSellers: TopSellerItem[]
}

function AnnouncementBanner({ announcement }: { announcement: HomeAnnouncement }) {
  const storageKey = `dismissed_announcement_${announcement.id}`
  const [dismissed, setDismissed] = useState(true) // default hidden until we check localStorage (avoids flash)

  useEffect(() => {
    setDismissed(localStorage.getItem(storageKey) === 'true')
  }, [storageKey])

  if (dismissed) return null

  const styles = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    urgent: 'bg-red-50 border-red-200 text-red-800',
  }[announcement.type]

  return (
    <div className={`border-b px-4 py-2.5 ${styles}`}>
      <div className="max-w-5xl mx-auto flex items-center gap-2.5">
        <Megaphone className="w-4 h-4 shrink-0" />
        <p className="text-sm font-medium flex-1 min-w-0">{announcement.message}</p>
        <button
          onClick={() => { localStorage.setItem(storageKey, 'true'); setDismissed(true) }}
          className="shrink-0 p-2 -m-1 rounded-lg hover:bg-black/5 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function CreditCardWarningModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="bg-white rounded-2xl max-w-sm w-full p-5 sm:p-6 shadow-xl max-h-full overflow-y-auto">
        <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6 text-amber-600" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Before you continue</h3>
        <p className="text-sm text-gray-600 text-center leading-relaxed">
          Credit card top-ups <strong>cannot be refunded</strong> — processing fees apply even if money is
          returned. We recommend starting with a smaller amount and topping up again later as needed.
        </p>
        <p className="text-sm text-gray-600 text-center leading-relaxed mt-2">
          Zelle, Venmo, and Cash App have no processing fees and can be refunded.
        </p>
        <p className="text-xs text-gray-400 text-center leading-relaxed mt-3 bg-gray-50 rounded-xl px-3 py-2">
          The payment page will open in a <strong>new browser tab</strong>. After paying, come back to
          this tab to submit the request form below so we know to credit the account.
        </p>
        <div className="flex flex-col gap-2 mt-5">
          <button
            onClick={onConfirm}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
          >
            I Understand, Continue
          </button>
          <button
            onClick={onCancel}
            className="w-full text-gray-500 hover:text-gray-700 font-medium py-2 text-sm"
          >
            Use a different payment method
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LandingClient({ loggedIn, settings, announcement, topSellers }: Props) {
  const canteenName = settings['canteen_name'] || 'Yeshiva Canteen'
  const tagline = settings['canteen_tagline'] || 'Easy online top-ups for your son\'s canteen account'
  const ccEnabled = settings['payment_cc_enabled'] === 'true'
  const nineDaysBlurb = settings['nine_days_blurb'] || ''
  const nineDaysFileUrl = settings['nine_days_file_url'] || ''

  const enabledMethods = ['zelle', 'venmo', 'paypal', 'cashapp', 'cash'].filter(
    m => settings[`payment_${m}_enabled`] === 'true'
  )
  const noteMethodNames = enabledMethods
    .filter(m => ['zelle', 'venmo', 'paypal', 'cashapp'].includes(m))
    .map(m => METHOD_LABELS[m])
  const noteMethodsText =
    noteMethodNames.length <= 1
      ? noteMethodNames.join('')
      : noteMethodNames.length === 2
      ? noteMethodNames.join(' or ')
      : `${noteMethodNames.slice(0, -1).join(', ')}, or ${noteMethodNames[noteMethodNames.length - 1]}`
  const hasNoteMethods = noteMethodNames.length > 0

  const formSectionRef = useRef<HTMLDivElement>(null)
  const previousMethodRef = useRef(enabledMethods[0] || 'zelle')
  const [ccModalOpen, setCcModalOpen] = useState(false)

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
  const [formError, setFormError] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileRef = useRef<HTMLDivElement>(null)
  const turnstileWidgetId = useRef<string | null>(null)
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  const renderTurnstile = useCallback(() => {
    if (!siteKey || !turnstileRef.current || !(window as any).turnstile) return
    // Only render once
    if (turnstileWidgetId.current !== null) return
    turnstileWidgetId.current = (window as any).turnstile.render(turnstileRef.current, {
      sitekey: siteKey,
      callback: (token: string) => setTurnstileToken(token),
      'expired-callback': () => setTurnstileToken(null),
      'error-callback': () => setTurnstileToken(null),
      theme: 'light',
    })
  }, [siteKey])

  function set(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }))
    if (formError) setFormError('')
  }

  function err(msg: string) {
    setFormError(msg)
    toast.error(msg)
  }

  function onMethodChange(v: string) {
    if (v === 'credit_card') {
      previousMethodRef.current = form.method
      set('method', 'credit_card')
      setCcModalOpen(true)
    } else {
      set('method', v)
    }
  }

  function cancelCreditCard() {
    set('method', previousMethodRef.current)
    setCcModalOpen(false)
  }

  function confirmCreditCard() {
    const rawBase = (settings['payment_cc_link'] || '').trim()
    if (rawBase) {
      let url = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`
      if (settings['payment_cc_prefill_enabled'] === 'true') {
        const amountParam = settings['payment_cc_amount_param'] || 'prefilled_amount'
        const nameParam = settings['payment_cc_name_param'] || 'client_reference_id'
        const params = new URLSearchParams()
        if (form.amount) params.set(amountParam, form.amount)
        if (form.studentName) params.set(nameParam, form.studentName)
        const qs = params.toString()
        if (qs) url += (url.includes('?') ? '&' : '?') + qs
      }
      window.open(url, '_blank', 'noopener,noreferrer')
    }
    setCcModalOpen(false)
    formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    if (!form.parentName.trim()) { err('Please enter your name'); return }
    if (!form.studentName.trim()) { err("Please enter your son's name"); return }

    const phoneDigits = form.parentPhone.replace(/\D/g, '')
    if (!form.parentPhone.trim()) { err('Please enter your phone number'); return }
    if (phoneDigits.length < 7) { err('Please enter a valid phone number'); return }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!form.parentEmail.trim()) { err('Please enter your email'); return }
    if (!emailRegex.test(form.parentEmail.trim())) { err('Please enter a valid email address'); return }

    const amt = parseFloat(form.amount)
    if (!Number.isFinite(amt) || amt <= 0) { err('Please enter a valid amount'); return }
    if (amt > 10000) { err('Amount cannot exceed $10,000'); return }

    const method = form.method || 'cash'

    if (siteKey && !turnstileToken) {
      err('Please complete the security check below.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amt,
          method,
          sender_name: form.parentName.trim(),
          parent_phone: form.parentPhone.trim(),
          parent_email: form.parentEmail.trim(),
          student_name: form.studentName.trim(),
          transaction_ref: form.transactionRef.trim() || null,
          notes: form.notes.trim() || null,
          'cf-turnstile-response': turnstileToken,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        err(json.error || 'Failed to submit — please try again or contact us directly.')
        return
      }
      setStep('success')
      // Reset Turnstile for next submission
      if (siteKey && turnstileWidgetId.current !== null && (window as any).turnstile) {
        (window as any).turnstile.reset(turnstileWidgetId.current)
        setTurnstileToken(null)
      }
    } catch (e) {
      console.error('Topup error:', e)
      err('Failed to submit — please try again or contact us directly.')
      // Reset Turnstile on error too
      if (siteKey && turnstileWidgetId.current !== null && (window as any).turnstile) {
        (window as any).turnstile.reset(turnstileWidgetId.current)
        setTurnstileToken(null)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50">
      {ccModalOpen && <CreditCardWarningModal onCancel={cancelCreditCard} onConfirm={confirmCreditCard} />}

      {/* Nav */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center shrink-0">
              <ShoppingBag className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 truncate">{canteenName}</span>
          </div>
          {loggedIn ? (
            <Link
              href="/pos"
              className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors shrink-0 ml-3"
            >
              Go to POS <ChevronRight className="w-4 h-4" />
            </Link>
          ) : (
            <Link
              href="/login"
              className="text-sm text-gray-500 hover:text-gray-800 font-medium transition-colors shrink-0 ml-3"
            >
              Staff Login
            </Link>
          )}
        </div>
        {announcement && <AnnouncementBanner announcement={announcement} />}
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
        {/* Hero */}
        <div className="text-center mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-semibold mb-4">
            <Smartphone className="w-3.5 h-3.5" /> Parent Portal
          </div>
          <h1 className="text-balance break-words text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 mb-3 leading-tight max-w-2xl mx-auto px-2">
            {canteenName}
          </h1>
          <p className="text-balance break-words text-gray-500 text-base sm:text-lg max-w-md mx-auto px-2">{tagline}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-start">
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
            {(enabledMethods.filter(m => m !== 'cash').length > 0 || ccEnabled) && (
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Send payment to</h3>

                {hasNoteMethods && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2.5 mb-3">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <p className="text-xs leading-relaxed">
                      When sending {noteMethodsText}, please include in the payment notes:{' '}
                      <span className="font-mono font-semibold">CANTEEN - [your son's name]</span>
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  {enabledMethods.filter(m => m !== 'cash').map(method => {
                    const info = settings[`payment_${method}_info`]
                    if (!info) return null
                    const deepLink = getPaymentDeepLink(method, info)
                    const color = METHOD_COLORS[method] || '#F59E0B'
                    const logo = METHOD_LOGOS[method]
                    return (
                      <div key={method} className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0" style={{ background: color }}>
                            {logo}
                          </div>
                          <p className="flex-1 min-w-0 font-semibold text-gray-900 text-sm truncate">{METHOD_LABELS[method]}</p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={async () => {
                                const ok = await copyToClipboard(info)
                                if (ok) toast.success(`${METHOD_LABELS[method]} handle copied!`, { duration: 2000 })
                                else toast.error('Could not copy — please copy manually')
                              }}
                              className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors active:scale-95"
                              title="Copy to clipboard"
                            >
                              <Copy className="w-3.5 h-3.5" /> Copy
                            </button>
                            {deepLink && (
                              <a
                                href={deepLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-white rounded-lg transition-opacity hover:opacity-90 active:scale-95"
                                style={{ background: color }}
                              >
                                <ExternalLink className="w-3.5 h-3.5" /> Open
                              </a>
                            )}
                          </div>
                        </div>
                        <p className="text-sm font-mono break-all mt-2.5 pl-[52px]" style={{ color }}>{info}</p>
                      </div>
                    )
                  })}

                  {ccEnabled && (
                    <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: METHOD_COLORS.credit_card }}>
                          <CreditCard className="w-5 h-5" />
                        </div>
                        <p className="flex-1 min-w-0 font-semibold text-gray-900 text-sm truncate">Credit Card</p>
                        <button
                          onClick={() => onMethodChange('credit_card')}
                          className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-white rounded-lg transition-opacity hover:opacity-90 active:scale-95 shrink-0"
                          style={{ background: METHOD_COLORS.credit_card }}
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Pay Online
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-2.5 pl-[52px]">No refunds — processing fees apply</p>
                    </div>
                  )}

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
          <div ref={formSectionRef} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6 scroll-mt-20">
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
                {formError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                    {formError}
                  </div>
                )}
                <form onSubmit={submit} noValidate className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Your Name *</label>
                      <input
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all min-h-[44px]"
                        placeholder="Parent's name"
                        value={form.parentName}
                        onChange={e => set('parentName', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Son's Name *</label>
                      <input
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all min-h-[44px]"
                        placeholder="Student's name"
                        value={form.studentName}
                        onChange={e => set('studentName', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Your Phone *</label>
                      <input
                        type="tel"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all min-h-[44px]"
                        placeholder="(555) 000-0000"
                        value={form.parentPhone}
                        onChange={e => set('parentPhone', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Your Email *</label>
                      <input
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all min-h-[44px]"
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
                        inputMode="decimal"
                        className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all min-h-[44px]"
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
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all bg-white min-h-[44px]"
                      value={form.method}
                      onChange={e => onMethodChange(e.target.value)}
                    >
                      {enabledMethods.map(m => (
                        <option key={m} value={m}>{METHOD_LABELS[m]}</option>
                      ))}
                      {ccEnabled && <option value="credit_card">{METHOD_LABELS.credit_card}</option>}
                    </select>
                  </div>

                  {form.method !== 'cash' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Confirmation / Reference # <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all min-h-[44px]"
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
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all resize-none"
                      rows={2}
                      placeholder="Any extra info..."
                      value={form.notes}
                      onChange={e => set('notes', e.target.value)}
                    />
                  </div>

                  {/* Cloudflare Turnstile widget */}
                  {siteKey && (
                    <>
                      <Script
                        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                        strategy="afterInteractive"
                        onLoad={renderTurnstile}
                      />
                      <div ref={turnstileRef} className="flex justify-center" />
                    </>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || (!!siteKey && !turnstileToken)}
                    className="w-full flex items-center justify-center gap-2 bg-amber-400 hover:bg-amber-500 disabled:opacity-60 text-white font-semibold py-3 min-h-[48px] rounded-xl transition-colors text-sm"
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

        {/* Popular items */}
        {topSellers.length > 0 && (
          <section className="mt-14 sm:mt-16">
            <div className="flex items-center gap-2 mb-4">
              <Flame className="w-5 h-5 text-amber-500" />
              <h2 className="text-xl font-bold text-gray-900">Popular Right Now</h2>
            </div>
            <p className="text-gray-500 text-sm mb-4 max-w-xl">
              A taste of what bochurim are grabbing at the canteen these days.
            </p>
            <div className="flex flex-wrap gap-2.5">
              {topSellers.map((item, i) => (
                <div key={i} className="flex items-center gap-2 bg-white border border-gray-100 shadow-sm rounded-2xl px-4 py-2.5">
                  {item.icon && <span className="text-lg leading-none">{item.icon}</span>}
                  <span className="text-sm font-medium text-gray-800">{item.name}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Nine Days */}
        {(nineDaysBlurb || nineDaysFileUrl) && (
          <section className="mt-10 sm:mt-12">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-2">During the Nine Days</h2>
              {nineDaysBlurb && (
                <p className="text-gray-500 text-sm leading-relaxed max-w-2xl">{nineDaysBlurb}</p>
              )}
              {nineDaysFileUrl && (
                <a
                  href={nineDaysFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-amber-600 hover:underline"
                >
                  <FileText className="w-4 h-4" /> View the Nine Days menu flyer
                </a>
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-gray-100 mt-16 py-6 text-center text-sm text-gray-400">
        {canteenName} · Powered by Canteen POS
      </footer>
    </div>
  )
}
