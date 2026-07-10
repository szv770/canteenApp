import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTopupReceived } from '@/lib/email'

// Public endpoint — parents submit top-up requests (no auth required).
// All validation is done server-side; the client cannot bypass this.

const MAX_TOPUP_AMOUNT = 10_000 // $10,000 hard cap — adjust as needed
const MIN_TOPUP_AMOUNT = 1
const ALLOWED_METHODS = ['zelle', 'venmo', 'paypal', 'cashapp', 'cash', 'credit_card'] as const
type AllowedMethod = typeof ALLOWED_METHODS[number]

// Simple in-memory rate limiter: max 5 requests per IP per 10 minutes.
// For production consider a Redis-backed solution like Upstash.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const windowMs = 10 * 60 * 1000 // 10 minutes
  const maxRequests = 5

  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= maxRequests) return false
  entry.count++
  return true
}

function sanitizeString(s: unknown, maxLen = 200): string {
  if (typeof s !== 'string') return ''
  return s.trim().slice(0, maxLen)
}

export async function POST(req: NextRequest) {
  // Rate limiting
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a few minutes and try again.' },
      { status: 429 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // --- Cloudflare Turnstile verification ---
  const turnstileSecret = process.env.CLOUDFLARE_TURNSTILE_SECRET
  if (turnstileSecret) {
    const token = typeof body['cf-turnstile-response'] === 'string' ? body['cf-turnstile-response'] : ''
    if (!token) {
      return NextResponse.json({ error: 'Please complete the security check.' }, { status: 400 })
    }
    const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: turnstileSecret, response: token }),
    })
    const vResult = await verify.json() as { success: boolean }
    if (!vResult.success) {
      return NextResponse.json({ error: 'Security check failed. Please refresh and try again.' }, { status: 400 })
    }
  }

  // --- Server-side input validation ---

  const parentName = sanitizeString(body.sender_name, 100)
  const studentName = sanitizeString(body.student_name, 100)
  const parentPhone = sanitizeString(body.parent_phone, 30)
  const parentEmail = sanitizeString(body.parent_email, 200)
  const transactionRef = sanitizeString(body.transaction_ref, 100) || null
  const notes = sanitizeString(body.notes, 500) || null
  const methodRaw = sanitizeString(body.method, 20)
  const method = ALLOWED_METHODS.includes(methodRaw as AllowedMethod)
    ? (methodRaw as AllowedMethod)
    : null

  if (!parentName) {
    return NextResponse.json({ error: 'Parent name is required' }, { status: 400 })
  }
  if (!studentName) {
    return NextResponse.json({ error: 'Student name is required' }, { status: 400 })
  }
  if (!parentPhone || parentPhone.replace(/\D/g, '').length < 7) {
    return NextResponse.json({ error: 'Valid phone number is required' }, { status: 400 })
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!parentEmail || !emailRegex.test(parentEmail)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }
  if (!method) {
    return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })
  }

  // Amount: must be a finite positive number within reasonable bounds
  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount < MIN_TOPUP_AMOUNT || amount > MAX_TOPUP_AMOUNT) {
    return NextResponse.json(
      { error: `Amount must be between $${MIN_TOPUP_AMOUNT} and $${MAX_TOPUP_AMOUNT}` },
      { status: 400 }
    )
  }
  // Round to 2 decimal places to prevent floating-point shenanigans
  const sanitizedAmount = Math.round(amount * 100) / 100

  // Use admin client so this insert works even if anon RLS is restricted.
  // The balance_topups table for parent submissions intentionally has INSERT allowed
  // for anon (parents don't log in), but we still want server-side validation.
  const admin = createAdminClient()

  const { error } = await admin.from('balance_topups').insert({
    amount: sanitizedAmount,
    method,
    sender_name: parentName,
    parent_phone: parentPhone,
    parent_email: parentEmail,
    student_name: studentName,
    transaction_ref: transactionRef,
    notes,
    status: 'pending',
  })

  if (error) {
    console.error('[topup] Insert error:', error.message)
    return NextResponse.json(
      { error: 'Failed to submit request. Please try again.' },
      { status: 500 }
    )
  }

  // Send confirmation email — fire and forget (don't block response on email failure)
  if (process.env.RESEND_API_KEY) {
    sendTopupReceived({
      parentEmail,
      parentName,
      studentName,
      amount: sanitizedAmount,
      method,
    }).catch(e => console.error('[topup] Email error:', e))
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
