'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Script from 'next/script'
import Link from 'next/link'
import { Fraunces } from 'next/font/google'
import { ShoppingBag, Send, Check, ChevronRight, ChevronDown, Smartphone, Copy, ExternalLink, CreditCard, AlertTriangle, X, Megaphone, Info, FileText, Flame, ArrowRight, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'

// Warm serif for the hero heading only — the canteen name now appears exactly once on
// this page (in the hero), so it gets a more distinctive display face instead of sharing
// the plain Inter used everywhere else (POS/admin keep their own separate branding).
const heroFont = Fraunces({ subsets: ['latin'], weight: ['600'], style: ['normal'], display: 'swap' })

/*
 * Parent landing page visual system (this page only — POS/admin keep their branding):
 *   Base    cream #FAF9F6 + stone text scale
 *   Primary deep teal   — teal-700 #0F766E (badges, links, secondary actions, focus rings)
 *   Accent  terracotta  — orange-700 #C2410C (primary CTAs only; AA contrast w/ white text)
 *   Cards   frosted look — semi-opaque white fill + light border. Deliberately NO
 *           backdrop-blur: a dozen live backdrop-filter surfaces stacked over the
 *           animated blobs caused visible scroll jank on phones. A white/75 fill
 *           over the soft gradient background reads identically at zero cost.
 *           (The sticky nav keeps a small backdrop-blur-md — one cheap surface.)
 * Keyframes / reveal / confetti CSS lives in globals.css under the "lp-" prefix.
 *
 * Flow (single linear wizard, not two side-by-side panels): Step 1 is the ONE
 * place a payment method is chosen — tapping a card expands it in place with
 * everything needed (handle, copy, deep link, what to write in notes) and a
 * "continue" action. Only once that's done does Step 2 (the form) appear,
 * fixed to that method — no second method picker inside the form.
 */
const GLASS_CARD = 'bg-white/75 border border-white/60 ring-1 ring-stone-900/5 shadow-[0_8px_30px_rgba(28,25,23,0.06)]'
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
    info: 'bg-blue-50 border-blue-200 text-blue-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    urgent: 'bg-red-50 border-red-200 text-red-900',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 px-4 py-6">
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

// One card in the Step 1 accordion. Tapping the header selects the method (and,
// for manual methods, immediately copies the handle) and expands the body below.
function MethodCard({
  selected,
  onSelectHeader,
  icon,
  label,
  color,
  rightBadge,
  subtitle,
  disabled,
  children,
}: {
  selected: boolean
  onSelectHeader: () => void
  icon: React.ReactNode
  label: string
  color: string
  rightBadge?: React.ReactNode
  subtitle?: string
  disabled?: boolean
  children?: React.ReactNode
}) {
  return (
    <div
      className={`rounded-2xl overflow-hidden transition-all ${GLASS_CARD} ${
        selected ? 'ring-2 ring-teal-500/30 border-teal-300/70' : ''
      }`}
    >
      <button
        type="button"
        onClick={onSelectHeader}
        disabled={disabled}
        className="w-full flex items-center gap-3 p-4 text-left transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl shrink-0"
          style={{ color, background: `${color}14`, boxShadow: `inset 0 0 0 1px ${color}26` }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-stone-900 text-base truncate">{label}</p>
          {subtitle && <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>}
        </div>
        {rightBadge}
        {!disabled && (
          <ChevronDown className={`w-5 h-5 text-stone-400 shrink-0 transition-transform ${selected ? 'rotate-180' : ''}`} />
        )}
      </button>
      {selected && children && <div className="px-4 pb-4">{children}</div>}
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
  method: string
  ccFeePercent: number
  onChangeMethod: () => void
}

function TopUpFormSection({ settings, method, ccFeePercent, onChangeMethod }: TopUpFormSectionProps) {
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
    transactionRef: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  // Set when the widget errors, or never loads within a few seconds (ad blocker,
  // network hiccup, site-key/domain mismatch). A parent must never be permanently
  // stuck unable to submit because a third-party script didn't load — see the
  // matching fail-open change in app/api/topup/route.ts.
  const [turnstileUnavailable, setTurnstileUnavailable] = useState(false)
  const turnstileRef = useRef<HTMLDivElement>(null)
  const turnstileWidgetId = useRef<string | null>(null)
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  const renderTurnstile = useCallback(() => {
    if (!siteKey || !turnstileRef.current || !(window as any).turnstile) return
    // Only render once
    if (turnstileWidgetId.current !== null) return
    turnstileWidgetId.current = (window as any).turnstile.render(turnstileRef.current, {
      sitekey: siteKey,
      callback: (token: string) => { setTurnstileToken(token); setTurnstileUnavailable(false) },
      'expired-callback': () => setTurnstileToken(null),
      'error-callback': () => { setTurnstileToken(null); setTurnstileUnavailable(true) },
      theme: 'light',
    })
  }, [siteKey])

  useEffect(() => {
    if (!siteKey) return
    const timer = setTimeout(() => {
      if (turnstileWidgetId.current === null) setTurnstileUnavailable(true)
    }, 6000)
    return () => clearTimeout(timer)
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

    // Phone is optional — only validate the format if one was entered.
    if (form.parentPhone.trim()) {
      const phoneDigits = form.parentPhone.replace(/\D/g, '')
      if (phoneDigits.length < 7) { err('Please enter a valid phone number'); return }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!form.parentEmail.trim()) { err('Please enter your email'); return }
    if (!emailRegex.test(form.parentEmail.trim())) { err('Please enter a valid email address'); return }

    const amt = parseFloat(form.amount)
    if (!Number.isFinite(amt) || amt <= 0) { err('Please enter a valid amount'); return }
    if (amt > 10000) { err('Amount cannot exceed $10,000'); return }

    if (siteKey && !turnstileToken && !turnstileUnavailable) {
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

  const badgeLetter = METHOD_LOGOS[method]
  const brand = METHOD_COLORS[method] || '#0F766E'

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
            {method === 'credit_card'
              ? ' Funds are added once your card payment comes through and is verified.'
              : ' Funds will be added to their account shortly.'}
          </p>
          {method === 'credit_card' && (
            <>
              <div className="mt-4 max-w-xs mx-auto flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-3 py-2.5 text-left">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed">
                  Haven't paid yet? Open the payment page and enter{' '}
                  <strong>{formatMoney(submittedAmount / (1 - ccFeePercent / 100))}</strong>{' '}
                  (includes the {ccFeePercent}% card fee).
                </p>
              </div>
              <button
                onClick={openStripeLink}
                className="mt-3 inline-flex items-center gap-1.5 bg-orange-700 hover:bg-orange-800 text-white text-sm font-semibold px-5 py-2.5 min-h-[44px] rounded-xl transition-all active:scale-95 shadow-sm shadow-orange-700/20"
              >
                <CreditCard className="w-4 h-4" /> Open Payment Page
              </button>
            </>
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
          {/* Method is fixed from Step 1 — just a small readout + a way back, not a second picker */}
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0"
                style={{ color: brand, background: `${brand}14`, boxShadow: `inset 0 0 0 1px ${brand}26` }}
              >
                {method === 'credit_card' ? <CreditCard className="w-4 h-4" /> : badgeLetter}
              </div>
              <p className="text-sm font-semibold text-stone-900">Paying via {METHOD_LABELS[method]}</p>
            </div>
            <button type="button" onClick={onChangeMethod} className="text-xs font-semibold text-teal-700 hover:underline min-h-[36px] px-1">
              Change
            </button>
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
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Your Phone <span className="text-stone-400 font-normal">(optional)</span>
                </label>
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

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                {method === 'credit_card' ? 'Amount to Add *' : 'Amount Sent *'}
              </label>
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

            {method === 'credit_card' && (() => {
              const amt = parseFloat(form.amount)
              const hasAmount = Number.isFinite(amt) && amt > 0
              const grossUp = hasAmount ? amt / (1 - ccFeePercent / 100) : 0
              const feeAmount = hasAmount ? grossUp - amt : 0
              return (
                <div className="-mt-2 bg-teal-50/80 border border-teal-200/80 text-teal-900 rounded-xl px-3.5 py-3">
                  {hasAmount ? (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-teal-800">
                        <span>To add exactly {formatMoney(amt)} to the account...</span>
                      </div>
                      <div className="flex justify-between text-sm items-center pt-0.5 border-t border-teal-100">
                        <span className="text-teal-900 font-medium">Type this on the payment page</span>
                        <span className="font-bold text-amber-700">{formatMoney(grossUp)}</span>
                      </div>
                      <div className="text-[11px] text-teal-700/70">
                        (includes a {formatMoney(feeAmount)} fee at {ccFeePercent}%)
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-teal-700/80">
                      Enter an amount above to see exactly what to type on the payment page.
                    </p>
                  )}
                </div>
              )
            })()}

            {/* No ref # for cash (none exists) or credit card (payment happens after submitting) */}
            {method !== 'cash' && method !== 'credit_card' && (
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
                  onError={() => setTurnstileUnavailable(true)}
                />
                <div ref={turnstileRef} className="flex justify-center" />
                {turnstileUnavailable && (
                  <p className="text-xs text-stone-400 text-center">
                    Security check unavailable right now — you can still submit; we&apos;ll review your request manually.
                  </p>
                )}
              </>
            )}

            <button
              type="submit"
              disabled={submitting || (!!siteKey && !turnstileToken && !turnstileUnavailable)}
              className="w-full flex items-center justify-center gap-2 bg-orange-700 hover:bg-orange-800 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3.5 min-h-[52px] rounded-2xl transition-all active:scale-[0.98] text-base shadow-md shadow-orange-700/20"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : method === 'credit_card' ? (
                <CreditCard className="w-4 h-4" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {submitting
                ? 'Submitting...'
                : method === 'credit_card'
                ? 'Submit & Continue to Payment'
                : 'Submit Request'}
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
  const cashEnabled = settings['payment_cash_enabled'] === 'true'

  const manualMethods = ['zelle', 'venmo', 'paypal', 'cashapp'].filter(
    m => settings[`payment_${m}_enabled`] === 'true' && settings[`payment_${m}_info`]
  )

  // The ONE place a payment method gets picked. Selecting a card expands it in
  // place; confirming ("I've sent it" / "Continue") unlocks Step 2 below.
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null)
  const [formUnlocked, setFormUnlocked] = useState(false)

  // Copy button (inside the expanded card) briefly flashes a checkmark.
  const [copiedMethod, setCopiedMethod] = useState<string | null>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current) }, [])

  useEffect(() => {
    if (formUnlocked) scrollToId('topup-form')
  }, [formUnlocked])

  async function selectMethod(method: string) {
    setSelectedMethod(method)
    setFormUnlocked(false)
    if (manualMethods.includes(method)) {
      const info = settings[`payment_${method}_info`]
      if (info) {
        const ok = await copyToClipboard(info)
        if (ok) {
          setCopiedMethod(method)
          if (copiedTimer.current) clearTimeout(copiedTimer.current)
          copiedTimer.current = setTimeout(() => setCopiedMethod(null), 1600)
          toast.success(`${METHOD_LABELS[method]} handle copied!`, { duration: 2000 })
        }
      }
    }
  }

  async function copyAgain(method: string) {
    const info = settings[`payment_${method}_info`]
    if (!info) return
    const ok = await copyToClipboard(info)
    if (ok) {
      setCopiedMethod(method)
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopiedMethod(null), 1600)
      toast.success(`${METHOD_LABELS[method]} handle copied!`, { duration: 2000 })
    } else {
      toast.error('Could not copy — please copy manually')
    }
  }

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

  const hasAnyMethod = manualMethods.length > 0 || ccEnabled || ccComingSoon || cashEnabled

  return (
    <div className="relative min-h-screen bg-[#FAF9F6] text-stone-900 overflow-x-hidden">
      {/* Nav */}
      <nav className="bg-[#FAF9F6]/80 backdrop-blur-md border-b border-stone-200/70 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="w-8 h-8 bg-teal-700 rounded-lg flex items-center justify-center shrink-0 shadow-sm shadow-teal-700/20">
            <ShoppingBag className="w-4 h-4 text-white" />
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
        {/* Hero — name, tagline, one-line explainer of the whole flow */}
        <div className="text-center pt-12 pb-8 sm:pt-16 sm:pb-12 max-w-2xl mx-auto">
          <div className="lp-hero-in inline-flex items-center gap-2 bg-teal-700/10 text-teal-800 px-3.5 py-1.5 rounded-full text-xs font-semibold mb-5">
            <Smartphone className="w-3.5 h-3.5" /> Parent Portal
          </div>
          <h1 className={`${heroFont.className} lp-hero-in text-balance break-words text-4xl sm:text-6xl text-stone-900 mb-3 leading-[1.1] px-2`}>
            {canteenName}
          </h1>
          <p className="lp-hero-in text-balance break-words text-stone-600 text-base sm:text-lg max-w-md mx-auto px-2 leading-relaxed">
            {tagline}
          </p>
          <p className="lp-hero-in text-balance text-stone-500 text-sm sm:text-base max-w-lg mx-auto px-2 mt-4 leading-relaxed">
            Pick how you're paying below, and we'll walk you through the rest.{' '}
            <span className="text-stone-600 font-medium">This page doesn&apos;t charge you.</span>
          </p>
          <div className="lp-hero-in mt-7">
            <button
              onClick={() => scrollToId('send-payment')}
              className="inline-flex items-center justify-center gap-2 bg-orange-700 hover:bg-orange-800 text-white font-bold px-9 py-4 min-h-[56px] rounded-2xl shadow-lg shadow-orange-700/25 transition-all active:scale-95 text-base sm:text-lg"
            >
              <Wallet className="w-5 h-5" /> Add Funds
            </button>
          </div>
        </div>

        <div className="max-w-xl mx-auto w-full space-y-8">
          {/* Step 1 — the one and only place a payment method is chosen */}
          <section id="send-payment" className="space-y-3 scroll-mt-24">
            <div className="lp-reveal">
              <StepHeading n="1" title="Choose how you're paying" subtitle="Tap one to see exactly what to do" />
            </div>

            {hasAnyMethod ? (
              <div className="space-y-2.5">
                {manualMethods.map((method, idx) => {
                  const info = settings[`payment_${method}_info`]
                  const deepLink = getPaymentDeepLink(method, info)
                  const copied = copiedMethod === method
                  const selected = selectedMethod === method
                  return (
                    <div key={method} style={{ transitionDelay: `${idx * 70}ms` }} className="lp-reveal">
                      <MethodCard
                        selected={selected}
                        onSelectHeader={() => selectMethod(method)}
                        icon={METHOD_LOGOS[method]}
                        label={METHOD_LABELS[method]}
                        color={METHOD_COLORS[method] || '#0F766E'}
                      >
                        <div className="flex items-center gap-1.5 mb-2">
                          <button
                            type="button"
                            onClick={() => copyAgain(method)}
                            className={`flex items-center gap-1 px-3 py-2.5 min-h-[44px] text-xs font-medium border rounded-lg transition-all active:scale-95 ${
                              copied
                                ? 'text-teal-700 border-teal-300 bg-teal-50'
                                : 'text-stone-500 hover:text-stone-800 border-stone-200 hover:border-stone-300 bg-white/60'
                            }`}
                          >
                            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied ? 'Copied' : 'Copy again'}
                          </button>
                          {deepLink && (
                            <a
                              href={deepLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 px-3 py-2.5 min-h-[44px] text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-all active:scale-95"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> Open
                            </a>
                          )}
                        </div>
                        <p className="text-sm font-mono font-semibold text-stone-700 break-all">{info}</p>
                        {!deepLink && (
                          <p className="text-xs text-stone-400 mt-1.5">
                            No app link available — open your banking app yourself and send to the info above.
                          </p>
                        )}
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200/80 text-amber-900 rounded-xl px-3 py-2.5 mt-3">
                          <Info className="w-4 h-4 shrink-0 mt-0.5" />
                          <p className="text-xs leading-relaxed">
                            Please include in the payment notes:{' '}
                            <span className="font-mono font-semibold">CANTEEN - [your son's name]</span>
                          </p>
                        </div>
                        <button
                          onClick={() => setFormUnlocked(true)}
                          className="mt-3 w-full flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-800 text-white font-semibold py-3 min-h-[48px] rounded-xl transition-all active:scale-[0.98] text-sm shadow-sm shadow-teal-700/20"
                        >
                          I've sent it — continue <ArrowRight className="w-4 h-4" />
                        </button>
                      </MethodCard>
                    </div>
                  )
                })}

                {ccEnabled && (
                  <div className="lp-reveal">
                    <MethodCard
                      selected={selectedMethod === 'credit_card'}
                      onSelectHeader={() => selectMethod('credit_card')}
                      icon={<CreditCard className="w-5 h-5" />}
                      label="Credit Card"
                      color={METHOD_COLORS.credit_card}
                      rightBadge={
                        <span className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-1 shrink-0">
                          {ccFeePercent}% fee
                        </span>
                      }
                    >
                      <p className="text-sm text-stone-600 leading-relaxed">
                        Fill out the form next with the amount you want added. After you submit, you'll be
                        redirected to a secure payment page to enter your card details manually.
                      </p>
                      <p className="text-sm text-stone-600 leading-relaxed mt-2">
                        Card payments have a <strong className="text-stone-800">{ccFeePercent}% processing fee</strong>,
                        so to add exactly $200 to the account you'd need to pay a bit more — we'll show you the exact
                        number once you enter an amount in the next step. Whatever amount actually comes through, we
                        deduct the fee and credit the rest. No refunds on card payments.
                      </p>
                      <button
                        onClick={() => setFormUnlocked(true)}
                        className="mt-3 w-full flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-800 text-white font-semibold py-3 min-h-[48px] rounded-xl transition-all active:scale-[0.98] text-sm shadow-sm shadow-teal-700/20"
                      >
                        Continue to the form <ArrowRight className="w-4 h-4" />
                      </button>
                    </MethodCard>
                  </div>
                )}

                {ccComingSoon && (
                  <div className="lp-reveal p-4 bg-stone-100/90 rounded-2xl border border-dashed border-stone-300/80">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-stone-400 bg-stone-200 shrink-0">
                        <CreditCard className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-stone-500 text-base">Credit Card (Online)</p>
                        <p className="text-xs text-stone-400 mt-0.5">Coming soon — not available yet</p>
                      </div>
                    </div>
                  </div>
                )}

                {cashEnabled && (
                  <div className="lp-reveal">
                    <MethodCard
                      selected={selectedMethod === 'cash'}
                      onSelectHeader={() => selectMethod('cash')}
                      icon="$"
                      label="Cash / Check"
                      color={METHOD_COLORS.cash}
                    >
                      <p className="text-sm text-stone-600 leading-relaxed">
                        Send cash or a check in with your son, or bring it in person. No handle or app needed —
                        just fill out the form next so we know to expect it.
                      </p>
                      <button
                        onClick={() => setFormUnlocked(true)}
                        className="mt-3 w-full flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-800 text-white font-semibold py-3 min-h-[48px] rounded-xl transition-all active:scale-[0.98] text-sm shadow-sm shadow-teal-700/20"
                      >
                        Continue <ArrowRight className="w-4 h-4" />
                      </button>
                    </MethodCard>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-stone-400 lp-reveal">No payment methods are set up yet — please contact us directly.</p>
            )}
          </section>

          {/* Step 2 — only appears once a method is chosen and confirmed above */}
          {selectedMethod && formUnlocked && (
            <section id="topup-form" className="space-y-3 scroll-mt-24">
              <div>
                <StepHeading n="2" title="Tell us about it" subtitle="So we know whose account to credit" />
              </div>
              <div>
                <TopUpFormSection
                  settings={settings}
                  method={selectedMethod}
                  ccFeePercent={ccFeePercent}
                  onChangeMethod={() => setFormUnlocked(false)}
                />
              </div>
            </section>
          )}
        </div>

        {/* Popular items */}
        {topSellers.length > 0 && (
          <section className="mt-10 sm:mt-14 lp-reveal">
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

      <footer className="relative z-10 border-t border-stone-200/70 mt-14 sm:mt-20 pt-8 pb-10">
        <div className="flex flex-col items-center gap-2.5 text-center px-4">
          <div className="w-7 h-7 bg-teal-700 rounded-lg flex items-center justify-center shrink-0 shadow-sm shadow-teal-700/20">
            <ShoppingBag className="w-3.5 h-3.5 text-white" />
          </div>
          <p className="text-xs text-stone-400">
            &copy; {new Date().getFullYear()} · Powered by Canteen POS
          </p>
        </div>
      </footer>
    </div>
  )
}
