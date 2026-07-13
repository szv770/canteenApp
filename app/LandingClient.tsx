'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Script from 'next/script'
import Link from 'next/link'
import { ShoppingBag, Send, Check, ChevronRight, Smartphone, Copy, ExternalLink, CreditCard, AlertTriangle, X, Megaphone, Info, FileText, Flame, ArrowDown, ArrowRight, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'

/*
 * Parent landing page visual system (this page only — POS/admin keep their branding):
 *   Base    cream #FAF9F6 + stone text scale
 *   Primary deep teal   — teal-700 #0F766E (badges, links, secondary actions, focus rings)
 *   Accent  terracotta  — orange-700 #C2410C (primary CTAs only; AA contrast w/ white text)
 *   Cards   frosted glass — bg-white/60 + backdrop-blur-xl + border-white/60
 * Keyframes / reveal / confetti CSS lives in globals.css under the "lp-" prefix.
 */
const GLASS_CARD = 'bg-white/60 backdrop-blur-xl border border-white/60 ring-1 ring-stone-900/5 shadow-[0_8px_30px_rgba(28,25,23,0.06)]'
const INPUT_CLS = 'w-full px-3 py-2.5 bg-white border border-stone-200 rounded-xl text-base text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-600/25 focus:border-teal-600 transition-all min-h-[44px]'

const METHOD_LABELS: Record<string, string> = {
  zelle: 'Zelle',
  venmo: 'Venmo',
  paypal: 'PayPal',
  cashapp: 'Cash App',
  cash: 'Cash / Check',
  credit_card: 'Credit Card (Online)',
}

// Brand colors are used only as a small tint on the method badge — cards stay in the page palette.
const METHOD_COLORS: Record<string, string> = {
  zelle: '#6D1ED4',
  venmo: '#008CFF',
  paypal: '#003087',
  cashapp: '#00A63C',
  cash: '#57534E',
  credit_card: '#0F766E',
}

const METHOD_LOGOS: Record<string, string> = {
  zelle: 'Z',
  venmo: 'V',
  paypal: 'P',
  cashapp: '$',
}

const CONFETTI_PIECES = [
  { left: '6%', delay: '0s', color: '#0F766E' },
  { left: '14%', delay: '0.25s', color: '#F59E0B' },
  { left: '24%', delay: '0.1s', color: '#C2410C' },
  { left: '33%', delay: '0.35s', color: '#14B8A6' },
  { left: '42%', delay: '0.05s', color: '#FBBF24' },
  { left: '50%', delay: '0.3s', color: '#0F766E' },
  { left: '58%', delay: '0.15s', color: '#EA580C' },
  { left: '67%', delay: '0.4s', color: '#2DD4BF' },
  { left: '76%', delay: '0.08s', color: '#C2410C' },
  { left: '84%', delay: '0.28s', color: '#F59E0B' },
  { left: '91%', delay: '0.18s', color: '#0D9488' },
  { left: '97%', delay: '0.38s', color: '#FB923C' },
]

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

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
    info: 'bg-blue-50/90 border-blue-200 text-blue-900',
    warning: 'bg-amber-50/90 border-amber-200 text-amber-900',
    urgent: 'bg-red-50/90 border-red-200 text-red-900',
  }[announcement.type]

  return (
    <div className={`border-b px-4 py-2.5 backdrop-blur-sm ${styles}`}>
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

function formatMoney(n: number) {
  return `$${n.toFixed(2)}`
}

function StepHeading({ n, title, subtitle }: { n: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 bg-teal-700 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm shadow-teal-700/20">
        {n}
      </div>
      <div className="min-w-0">
        <h2 className="text-lg sm:text-xl font-bold text-stone-900 leading-tight tracking-tight">{title}</h2>
        <p className="text-xs sm:text-sm text-stone-500 mt-0.5">{subtitle}</p>
      </div>
    </div>
  )
}

function CreditCardPaymentModal({
  amount,
  feePercent,
  onOpenStripe,
  onSkip,
}: {
  amount: number
  feePercent: number
  onOpenStripe: () => void
  onSkip: () => void
}) {
  const grossUp = amount / (1 - feePercent / 100)
  const feeAmount = grossUp - amount
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 backdrop-blur-sm px-4 py-6">
      <div className="bg-white rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl max-h-full overflow-y-auto animate-scale-in">
        <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6 text-amber-600" />
        </div>
        <h3 className="text-lg font-bold text-stone-900 text-center mb-2">Your request is saved — now send the payment</h3>
        <p className="text-sm text-stone-600 text-center leading-relaxed">
          Credit card payments have a <strong>{feePercent}% processing fee</strong>, and{' '}
          <strong>cannot be refunded</strong> — the fee still applies even if money is returned.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-stone-600">You requested</span>
            <span className="font-semibold text-stone-900">{formatMoney(amount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-stone-600">Processing fee ({feePercent}%)</span>
            <span className="font-semibold text-stone-900">{formatMoney(feeAmount)}</span>
          </div>
          <div className="flex justify-between text-sm pt-1 border-t border-amber-200">
            <span className="text-stone-700 font-medium">Please send this amount</span>
            <span className="font-bold text-amber-700">{formatMoney(grossUp)}</span>
          </div>
        </div>
        <p className="text-xs text-stone-400 text-center leading-relaxed mt-3 bg-stone-50 rounded-xl px-3 py-2">
          Stripe can't be pre-filled with the amount — you'll need to type <strong>{formatMoney(grossUp)}</strong>{' '}
          yourself on the payment page, which opens in a <strong>new browser tab</strong>.
        </p>
        <div className="flex flex-col gap-2 mt-5">
          <button
            onClick={onOpenStripe}
            className="w-full bg-orange-700 hover:bg-orange-800 text-white font-semibold py-3 min-h-[48px] rounded-xl transition-all active:scale-95 text-sm shadow-sm shadow-orange-700/20"
          >
            Continue to Payment Page
          </button>
          <button
            onClick={onSkip}
            className="w-full text-stone-500 hover:text-stone-700 font-medium py-2.5 min-h-[44px] text-sm transition-colors"
          >
            I'll pay later
          </button>
        </div>
      </div>
    </div>
  )
}

// TopUpFormSection is defined at module level (not inside LandingClient) so that React
// preserves the component identity across re-renders. Defining it inside LandingClient
// would cause it to remount on every state change, which makes controlled inputs lose
// focus and auto-select their text on each keystroke — the same issue documented in
// CLAUDE.md for the Settings page's SettingControl component.
interface TopUpFormSectionProps {
  settings: Record<string, string>
  enabledMethods: string[]
  ccEnabled: boolean
  ccFeePercent: number
  preferredMethod: string | null
}

function TopUpFormSection({ settings, enabledMethods, ccEnabled, ccFeePercent, preferredMethod }: TopUpFormSectionProps) {
  const formSectionRef = useRef<HTMLDivElement>(null)
  const [ccModalOpen, setCcModalOpen] = useState(false)
  const [submittedAmount, setSubmittedAmount] = useState(0)

  const [step, setStep] = useState<'form' | 'success'>('form')
  const [form, setForm] = useState({
    parentName: '',
    parentPhone: '',
    parentEmail: '',
    studentFirstName: '',
    studentLastName: '',
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

  // When a parent taps Copy / Open / "Pay by card" on a method card in Step 1,
  // pre-select that method here so they don't have to pick it twice.
  useEffect(() => {
    if (preferredMethod) {
      setForm(f => ({ ...f, method: preferredMethod }))
    }
  }, [preferredMethod])

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

  function openStripeLink() {
    const rawBase = (settings['payment_cc_link'] || '').trim()
    if (rawBase) {
      let url = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`
      // client_reference_id is the one query param Stripe Payment Links actually
      // support for passing data through — there is no way to prefill the amount.
      const fullStudentName = [form.studentFirstName, form.studentLastName].filter(Boolean).join(' ')
      if (fullStudentName) {
        const qs = new URLSearchParams({ client_reference_id: fullStudentName }).toString()
        url += (url.includes('?') ? '&' : '?') + qs
      }
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  function skipStripeForNow() {
    setCcModalOpen(false)
    setStep('success')
  }

  function continueToStripe() {
    openStripeLink()
    setCcModalOpen(false)
    setStep('success')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    if (!form.parentName.trim()) { err('Please enter your name'); return }
    if (!form.studentFirstName.trim()) { err("Please enter your son's first name"); return }
    if (!form.studentLastName.trim()) { err("Please enter your son's last name"); return }

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
          student_name: `${form.studentFirstName.trim()} ${form.studentLastName.trim()}`,
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
      setSubmittedAmount(amt)
      if (method === 'credit_card') {
        setCcModalOpen(true)
      } else {
        setStep('success')
      }
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
    <div ref={formSectionRef} className={`${GLASS_CARD} rounded-3xl p-4 sm:p-6`}>
      {ccModalOpen && (
        <CreditCardPaymentModal
          amount={submittedAmount}
          feePercent={ccFeePercent}
          onOpenStripe={continueToStripe}
          onSkip={skipStripeForNow}
        />
      )}
      {step === 'success' ? (
        <div className="relative text-center py-8 overflow-hidden">
          {/* CSS confetti — pure keyframes, fades out on its own */}
          <div className="absolute inset-x-0 top-0 h-40 pointer-events-none" aria-hidden="true">
            {CONFETTI_PIECES.map((p, i) => (
              <span
                key={i}
                className="lp-confetti"
                style={{ left: p.left, animationDelay: p.delay, background: p.color }}
              />
            ))}
          </div>
          {/* Animated stroke-drawn checkmark */}
          <svg className="w-20 h-20 mx-auto mb-4" viewBox="0 0 52 52" aria-hidden="true">
            <circle className="lp-check-circle" cx="26" cy="26" r="24" fill="none" stroke="#0F766E" strokeWidth="2.5" />
            <path className="lp-check-mark" fill="none" stroke="#0F766E" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" d="M15 27.5l7.5 7.5L37 19" />
          </svg>
          <h3 className="text-xl font-bold text-stone-900 mb-2">Request Submitted!</h3>
          <p className="text-stone-500 text-sm max-w-xs mx-auto">
            We received your top-up request for <strong className="text-stone-700">{form.studentFirstName} {form.studentLastName}</strong>.
            Funds will be added to their account shortly.
          </p>
          {form.method === 'credit_card' && (
            <button
              onClick={openStripeLink}
              className="mt-4 inline-flex items-center gap-1.5 bg-orange-700 hover:bg-orange-800 text-white text-sm font-semibold px-5 py-2.5 min-h-[44px] rounded-xl transition-all active:scale-95 shadow-sm shadow-orange-700/20"
            >
              Open Payment Page
            </button>
          )}
          <div>
            <button
              onClick={() => { setStep('form'); setForm(f => ({ ...f, parentName: '', studentFirstName: '', studentLastName: '', amount: '', transactionRef: '', notes: '' })) }}
              className="mt-4 text-sm text-teal-700 font-semibold hover:underline min-h-[44px] px-2"
            >
              Submit another request
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2 bg-red-50/90 border border-red-200 text-red-800 rounded-xl px-3 py-2.5 mb-5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">
              <strong>Send the payment first</strong> (Step 1 above). This form doesn't move money —
              it just tells us to expect your payment.
            </p>
          </div>
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">
              {formError}
            </div>
          )}
          <form onSubmit={submit} noValidate className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Son's First Name *</label>
                <input
                  className={INPUT_CLS}
                  placeholder="e.g. Moshe"
                  value={form.studentFirstName}
                  onChange={e => set('studentFirstName', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Son's Last Name *</label>
                <input
                  className={INPUT_CLS}
                  placeholder="e.g. Cohen"
                  value={form.studentLastName}
                  onChange={e => set('studentLastName', e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Your Name *</label>
              <input
                className={INPUT_CLS}
                placeholder="Parent's name"
                value={form.parentName}
                onChange={e => set('parentName', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Your Phone *</label>
                <input
                  type="tel"
                  className={INPUT_CLS}
                  placeholder="(555) 000-0000"
                  value={form.parentPhone}
                  onChange={e => set('parentPhone', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Your Email *</label>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className={INPUT_CLS}
                  placeholder="you@example.com"
                  value={form.parentEmail}
                  onChange={e => set('parentEmail', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Amount Sent *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-medium">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    className={`${INPUT_CLS} pl-7`}
                    placeholder="0.00"
                    min="1"
                    step="0.01"
                    value={form.amount}
                    onChange={e => set('amount', e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Method *</label>
                <select
                  className={INPUT_CLS}
                  value={form.method}
                  onChange={e => set('method', e.target.value)}
                >
                  {enabledMethods.map(m => (
                    <option key={m} value={m}>{METHOD_LABELS[m]}</option>
                  ))}
                  {ccEnabled && <option value="credit_card">{METHOD_LABELS.credit_card}</option>}
                </select>
              </div>
            </div>
            {form.method === 'credit_card' && (
              <p className="text-xs text-amber-700 -mt-2">
                {ccFeePercent}% processing fee applies — you'll see the exact amount to send after submitting.
              </p>
            )}

            {form.method !== 'cash' && (
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Confirmation / Reference # <span className="text-stone-400 font-normal">(optional)</span>
                </label>
                <input
                  className={INPUT_CLS}
                  placeholder="Transaction ID or last 4 digits"
                  value={form.transactionRef}
                  onChange={e => set('transactionRef', e.target.value)}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Notes <span className="text-stone-400 font-normal">(optional)</span>
              </label>
              <textarea
                className={`${INPUT_CLS} resize-none min-h-0`}
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
              className="w-full flex items-center justify-center gap-2 bg-orange-700 hover:bg-orange-800 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3.5 min-h-[52px] rounded-2xl transition-all active:scale-[0.98] text-base shadow-md shadow-orange-700/20"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>

            <p className="text-xs text-stone-400 text-center">
              Funds are credited once an admin verifies your payment.
            </p>
          </form>
        </>
      )}
    </div>
  )
}

export default function LandingClient({ loggedIn, settings, announcement, topSellers }: Props) {
  const canteenName = settings['canteen_name'] || 'Yeshiva Canteen'
  const tagline = settings['canteen_tagline'] || 'Easy online top-ups for your son\'s canteen account'
  const ccEnabled = settings['payment_cc_enabled'] === 'true'
  const ccFeePercent = parseFloat(settings['cc_fee_percent'] || '3')
  const ccNotConfigured = !(settings['payment_cc_link'] || '').trim()
  const ccComingSoon = !ccEnabled && ccNotConfigured && settings['payment_cc_coming_soon_enabled'] === 'true'
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

  // Set when the parent interacts with a method card (Copy / Open / Pay by card) so
  // the form's Method dropdown pre-selects it — one less thing to pick twice.
  const [preferredMethod, setPreferredMethod] = useState<string | null>(null)

  // Copy button briefly flashes a checkmark for the method just copied.
  const [copiedMethod, setCopiedMethod] = useState<string | null>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current) }, [])

  // Sticky mobile CTA: shown until the form section is scrolled into view.
  const [showStickyCta, setShowStickyCta] = useState(false)
  useEffect(() => {
    const el = document.getElementById('topup-form')
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(
      ([entry]) => setShowStickyCta(!entry.isIntersecting),
      { rootMargin: '0px 0px -25% 0px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Scroll-triggered reveal: adds .lp-visible when a .lp-reveal element enters the viewport.
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.lp-reveal'))
    if (typeof IntersectionObserver === 'undefined') {
      els.forEach(el => el.classList.add('lp-visible'))
      return
    }
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('lp-visible')
            obs.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }
    )
    els.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  return (
    <div className="relative min-h-screen bg-[#FAF9F6] text-stone-900 pb-20 lg:pb-0 overflow-x-hidden">
      {/* Floating gradient blobs behind the hero */}
      <div className="absolute inset-x-0 top-0 h-[640px] overflow-hidden pointer-events-none" aria-hidden="true">
        <div
          className="lp-blob"
          style={{ width: 380, height: 380, top: -110, left: '-12%', background: 'radial-gradient(circle at 35% 35%, rgba(15,118,110,0.22), rgba(15,118,110,0) 70%)', animation: 'lp-blob-a 13s ease-in-out infinite' }}
        />
        <div
          className="lp-blob"
          style={{ width: 420, height: 420, top: 40, right: '-16%', background: 'radial-gradient(circle at 60% 40%, rgba(234,88,12,0.16), rgba(234,88,12,0) 70%)', animation: 'lp-blob-b 15s ease-in-out infinite' }}
        />
        <div
          className="lp-blob"
          style={{ width: 320, height: 320, top: 330, left: '28%', background: 'radial-gradient(circle at 50% 50%, rgba(245,158,11,0.18), rgba(245,158,11,0) 70%)', animation: 'lp-blob-c 11s ease-in-out infinite' }}
        />
      </div>

      {/* Nav */}
      <nav className="bg-[#FAF9F6]/80 backdrop-blur-md border-b border-stone-200/70 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-teal-700 rounded-lg flex items-center justify-center shrink-0 shadow-sm shadow-teal-700/20">
              <ShoppingBag className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-stone-900 truncate">{canteenName}</span>
          </div>
          {loggedIn ? (
            <Link
              href="/pos"
              className="flex items-center gap-1.5 bg-teal-700 hover:bg-teal-800 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 shrink-0 ml-3"
            >
              Go to POS <ChevronRight className="w-4 h-4" />
            </Link>
          ) : (
            <Link
              href="/login"
              className="text-sm text-stone-500 hover:text-stone-800 font-medium transition-colors shrink-0 ml-3 py-2"
            >
              Staff Login
            </Link>
          )}
        </div>
        {announcement && <AnnouncementBanner announcement={announcement} />}
      </nav>

      <main className="relative z-10 max-w-5xl mx-auto px-4 pb-6 sm:pb-12">
        {/* Hero — generous, animated entrance */}
        <div className="text-center pt-14 pb-10 sm:pt-24 sm:pb-16">
          <div className="lp-hero-in inline-flex items-center gap-2 bg-teal-700/10 text-teal-800 px-3.5 py-1.5 rounded-full text-xs font-semibold mb-5">
            <Smartphone className="w-3.5 h-3.5" /> Parent Portal
          </div>
          <h1
            className="lp-hero-in text-balance break-words text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-stone-900 mb-3 sm:mb-4 leading-[1.08] max-w-2xl mx-auto px-2"
            style={{ animationDelay: '0.08s' }}
          >
            {canteenName}
          </h1>
          <p
            className="lp-hero-in text-balance break-words text-stone-500 text-base sm:text-lg max-w-md mx-auto px-2"
            style={{ animationDelay: '0.16s' }}
          >
            {tagline}
          </p>

          {/* Primary CTA */}
          <div className="lp-hero-in mt-7 sm:mt-8 flex flex-col items-center gap-2" style={{ animationDelay: '0.24s' }}>
            <button
              onClick={() => scrollToId('send-payment')}
              className="inline-flex items-center justify-center gap-2 bg-orange-700 hover:bg-orange-800 text-white font-bold px-9 py-4 min-h-[56px] rounded-2xl shadow-lg shadow-orange-700/25 transition-all active:scale-95 text-base sm:text-lg"
            >
              <Wallet className="w-5 h-5" /> Add Funds
            </button>
            <button
              onClick={() => scrollToId('topup-form')}
              className="text-sm text-teal-700 font-semibold hover:underline min-h-[44px] px-3"
            >
              Already sent the money? Submit the form <ArrowRight className="w-3.5 h-3.5 inline -mt-0.5" />
            </button>
          </div>

          {/* Compact how-it-works strip — frosted glass */}
          <div
            className={`lp-hero-in mt-9 sm:mt-12 max-w-md mx-auto ${GLASS_CARD} rounded-3xl divide-y divide-stone-200/60 text-left`}
            style={{ animationDelay: '0.32s' }}
          >
            {[
              { n: '1', title: 'Send money from your own app', desc: "Zelle, Venmo, etc. — this page can't send it for you." },
              { n: '2', title: 'Submit the short form here', desc: "Tell us who it's for and how much you sent." },
              { n: '3', title: "We credit your son's account", desc: 'Usually within a few hours of verifying the payment.' },
            ].map(step => (
              <div key={step.n} className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-6 h-6 bg-teal-700/10 text-teal-800 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                  {step.n}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-stone-900 text-sm leading-snug">{step.title}</p>
                  <p className="text-stone-500 text-xs mt-0.5">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 items-start">
          {/* Step 1 — Send the payment */}
          <section id="send-payment" className="space-y-4 scroll-mt-24">
            <div className="lp-reveal">
              <StepHeading n="1" title="Send the payment" subtitle="From your own banking or payment app" />
            </div>

            {(enabledMethods.length > 0 || ccEnabled || ccComingSoon) && (
              <div>
                {hasNoteMethods && (
                  <div className="lp-reveal flex items-start gap-2 bg-amber-50/80 border border-amber-200/80 text-amber-900 rounded-xl px-3 py-2.5 mb-3 backdrop-blur-sm">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <p className="text-xs leading-relaxed">
                      When sending {noteMethodsText}, please include in the payment notes:{' '}
                      <span className="font-mono font-semibold">CANTEEN - [your son's name]</span>
                    </p>
                  </div>
                )}

                <div className="space-y-2.5">
                  {enabledMethods.filter(m => m !== 'cash').map((method, idx) => {
                    const info = settings[`payment_${method}_info`]
                    if (!info) return null
                    const deepLink = getPaymentDeepLink(method, info)
                    const brand = METHOD_COLORS[method] || '#0F766E'
                    const logo = METHOD_LOGOS[method]
                    const copied = copiedMethod === method
                    return (
                      <div
                        key={method}
                        className={`lp-reveal p-4 ${GLASS_CARD} rounded-2xl`}
                        style={{ transitionDelay: `${idx * 70}ms` }}
                      >
                        <div className="flex items-center gap-3">
                          {/* Brand shows only as a tinted badge — card stays in the page palette */}
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shrink-0"
                            style={{ color: brand, background: `${brand}14`, boxShadow: `inset 0 0 0 1px ${brand}26` }}
                          >
                            {logo}
                          </div>
                          <p className="flex-1 min-w-0 font-semibold text-stone-900 text-sm truncate">{METHOD_LABELS[method]}</p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={async () => {
                                setPreferredMethod(method)
                                const ok = await copyToClipboard(info)
                                if (ok) {
                                  setCopiedMethod(method)
                                  if (copiedTimer.current) clearTimeout(copiedTimer.current)
                                  copiedTimer.current = setTimeout(() => setCopiedMethod(null), 1600)
                                  toast.success(`${METHOD_LABELS[method]} handle copied!`, { duration: 2000 })
                                } else {
                                  toast.error('Could not copy — please copy manually')
                                }
                              }}
                              className={`flex items-center gap-1 px-3 py-2.5 min-h-[44px] text-xs font-medium border rounded-lg transition-all active:scale-95 ${
                                copied
                                  ? 'text-teal-700 border-teal-300 bg-teal-50'
                                  : 'text-stone-500 hover:text-stone-800 border-stone-200 hover:border-stone-300 bg-white/60'
                              }`}
                              title="Copy to clipboard"
                            >
                              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              {copied ? 'Copied' : 'Copy'}
                            </button>
                            {deepLink && (
                              <a
                                href={deepLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => setPreferredMethod(method)}
                                className="flex items-center gap-1 px-3 py-2.5 min-h-[44px] text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-all active:scale-95"
                              >
                                <ExternalLink className="w-3.5 h-3.5" /> Open
                              </a>
                            )}
                          </div>
                        </div>
                        <p className="text-sm font-mono font-semibold text-stone-700 break-all mt-2.5 pl-[52px]">{info}</p>
                        {!deepLink && (
                          <p className="text-xs text-stone-400 mt-1.5 pl-[52px]">
                            No app link available for {METHOD_LABELS[method]} — open your banking app yourself and send to the info above.
                          </p>
                        )}
                      </div>
                    )
                  })}

                  {ccEnabled && (
                    <div className={`lp-reveal p-4 ${GLASS_CARD} rounded-2xl`}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-teal-700 bg-teal-700/10 shrink-0" style={{ boxShadow: 'inset 0 0 0 1px rgba(15,118,110,0.15)' }}>
                          <CreditCard className="w-5 h-5" />
                        </div>
                        <p className="flex-1 min-w-0 font-semibold text-stone-900 text-sm truncate">Credit Card</p>
                        <span className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-1 shrink-0">
                          {ccFeePercent}% fee
                        </span>
                      </div>
                      <p className="text-xs text-stone-400 mt-2.5 pl-[52px]">No refunds. Submit the form first — the payment page opens after.</p>
                      <button
                        onClick={() => { setPreferredMethod('credit_card'); scrollToId('topup-form') }}
                        className="ml-[52px] mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900 min-h-[44px] transition-colors"
                      >
                        Pay by card — fill out the form <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {ccComingSoon && (
                    <div className="lp-reveal p-4 bg-stone-100/70 backdrop-blur-sm rounded-2xl border border-dashed border-stone-300/80">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-stone-400 bg-stone-200 shrink-0">
                          <CreditCard className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-stone-500 text-sm">Credit Card</p>
                          <p className="text-xs text-stone-400 mt-0.5">Coming soon — not available yet</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {settings['payment_cash_enabled'] === 'true' && (
                    <div className={`lp-reveal p-4 ${GLASS_CARD} rounded-2xl`}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0 text-stone-600 bg-stone-500/10" style={{ boxShadow: 'inset 0 0 0 1px rgba(87,83,78,0.15)' }}>
                          $
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-stone-900 text-sm">Cash / Check</p>
                          <p className="text-xs text-stone-500 mt-0.5">Send in with your son or bring in person</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Mobile-only: continue to the form after sending */}
                <button
                  onClick={() => scrollToId('topup-form')}
                  className="lp-reveal lg:hidden mt-4 w-full flex items-center justify-center gap-2 bg-teal-800 hover:bg-teal-900 text-white font-semibold py-3.5 min-h-[52px] rounded-2xl transition-all active:scale-[0.98] text-sm shadow-sm shadow-teal-800/20"
                >
                  I've sent it — continue to Step 2 <ArrowDown className="w-4 h-4" />
                </button>
              </div>
            )}
          </section>

          {/* Step 2 — Tell us about it */}
          <section id="topup-form" className="space-y-4 scroll-mt-24">
            <div className="lp-reveal">
              <StepHeading n="2" title="Tell us about it" subtitle="So we know whose account to credit" />
            </div>
            {/* Form — rendered as a stable module-level component so inputs don't remount */}
            <div className="lp-reveal" style={{ transitionDelay: '80ms' }}>
              <TopUpFormSection
                settings={settings}
                enabledMethods={enabledMethods}
                ccEnabled={ccEnabled}
                ccFeePercent={ccFeePercent}
                preferredMethod={preferredMethod}
              />
            </div>
          </section>
        </div>

        {/* Popular items */}
        {topSellers.length > 0 && (
          <section className="mt-12 sm:mt-16 lp-reveal">
            <div className="flex items-center gap-2 mb-1.5">
              <Flame className="w-5 h-5 text-orange-600" />
              <h2 className="text-lg sm:text-xl font-bold text-stone-900 tracking-tight">Popular Right Now</h2>
            </div>
            <p className="text-stone-500 text-sm mb-3.5 max-w-xl">
              A taste of what bochurim are grabbing at the canteen these days.
            </p>
            <div className="flex flex-wrap gap-2">
              {topSellers.map((item, i) => (
                <div key={i} className={`flex items-center gap-2 ${GLASS_CARD} rounded-2xl px-3.5 py-2`}>
                  {item.icon && <span className="text-lg leading-none">{item.icon}</span>}
                  <span className="text-sm font-medium text-stone-800">{item.name}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Nine Days */}
        {(nineDaysBlurb || nineDaysFileUrl) && (
          <section className="mt-8 sm:mt-12 lp-reveal">
            <div className={`${GLASS_CARD} rounded-3xl p-5 sm:p-6`}>
              <h2 className="text-lg font-bold text-stone-900 mb-2 tracking-tight">During the Nine Days</h2>
              {nineDaysBlurb && (
                <p className="text-stone-500 text-sm leading-relaxed max-w-2xl">{nineDaysBlurb}</p>
              )}
              {nineDaysFileUrl && (
                <a
                  href={nineDaysFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-teal-700 hover:underline min-h-[44px]"
                >
                  <FileText className="w-4 h-4" /> View the Nine Days menu flyer
                </a>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Sticky mobile CTA — hides once the form is in view */}
      {showStickyCta && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-20 px-4 pb-4 pt-2 bg-gradient-to-t from-[#FAF9F6] via-[#FAF9F6]/90 to-transparent pointer-events-none">
          <button
            onClick={() => scrollToId('send-payment')}
            className="pointer-events-auto w-full flex items-center justify-center gap-2 bg-orange-700 hover:bg-orange-800 text-white font-bold py-3.5 min-h-[52px] rounded-2xl shadow-lg shadow-orange-700/30 transition-all active:scale-[0.98] text-base"
          >
            <Wallet className="w-5 h-5" /> Add Funds
          </button>
        </div>
      )}

      <footer className="relative z-10 border-t border-stone-200/70 mt-12 sm:mt-16 py-6 text-center text-sm text-stone-400">
        {canteenName} · Powered by Canteen POS
      </footer>
    </div>
  )
}
