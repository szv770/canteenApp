import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTopupApproved, sendTopupRejected, buildEmailSettings } from '@/lib/email'

/**
 * POST /api/admin/topup-confirm
 * Confirms a pending balance top-up, credits the bochur's balance, and
 * records the ledger entry. Admin or cashier role required.
 *
 * DB-side RLS recommendation:
 *   balance_topups: authenticated users with role cashier/admin can UPDATE status.
 *   bochurim: only authenticated cashiers/admins can UPDATE balance.
 *   balance_ledger: only authenticated cashiers/admins can INSERT.
 */

async function requireCashier() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('cashier_profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .single()
  if (!data || !data.is_active) return null
  return { user, profile: data }
}

export async function POST(req: NextRequest) {
  const auth = await requireCashier()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const topupId = typeof body.topup_id === 'string' ? body.topup_id.trim() : ''
  if (!topupId) {
    return NextResponse.json({ error: 'topup_id is required' }, { status: 400 })
  }

  // When true: mark as confirmed but skip balance update + ledger entry.
  // Use when the admin already manually added balance before the request came in.
  const skipCredit = body.skip_credit === true

  // Optional: date the payment actually arrived (e.g. Zelle transfer date)
  const paymentReceivedDate = typeof body.payment_received_date === 'string' && body.payment_received_date.match(/^\d{4}-\d{2}-\d{2}$/)
    ? body.payment_received_date
    : null

  const admin = createAdminClient()

  // Fetch the topup — verify it's pending and has a bochur linked
  const { data: topup, error: topupErr } = await admin
    .from('balance_topups')
    .select('id, amount, method, sender_name, student_name, parent_email, bochur_id, status')
    .eq('id', topupId)
    .single()

  if (topupErr || !topup) {
    return NextResponse.json({ error: 'Top-up not found' }, { status: 404 })
  }
  if (topup.status !== 'pending') {
    return NextResponse.json(
      { error: `Top-up is already ${topup.status}` },
      { status: 409 }
    )
  }
  if (!topup.bochur_id) {
    return NextResponse.json(
      { error: 'Link the top-up to a bochur before confirming' },
      { status: 400 }
    )
  }

  // Validate the amount stored in DB (defensive check)
  if (!Number.isFinite(topup.amount) || topup.amount <= 0 || topup.amount > 100_000) {
    return NextResponse.json({ error: 'Top-up has invalid amount' }, { status: 400 })
  }

  // --- Atomic status claim (TOCTOU guard) ---
  // Update status to 'confirmed' only if it is still 'pending'.
  // If two requests race here, exactly one will update a row; the other
  // gets 0 rows back and returns 409 — preventing double-credit.
  const { data: claimed, error: claimErr } = await admin
    .from('balance_topups')
    .update({
      status: 'confirmed',
      confirmed_by: auth.user.id,
      confirmed_at: new Date().toISOString(),
      ...(paymentReceivedDate ? { payment_received_date: paymentReceivedDate } : {}),
    })
    .eq('id', topupId)
    .eq('status', 'pending')  // atomic guard — only succeeds once
    .select('id')

  if (claimErr) {
    console.error('[topup-confirm] Status claim error:', claimErr.message)
    return NextResponse.json({ error: 'Failed to confirm top-up' }, { status: 500 })
  }
  if (!claimed || claimed.length === 0) {
    // Another request already confirmed (or rejected) this top-up
    return NextResponse.json({ error: 'Top-up already processed' }, { status: 409 })
  }

  let newBalance: number

  if (skipCredit) {
    // Admin already manually credited the balance — just mark as approved, no balance/ledger change.
    // We still need current balance for the approval email.
    const { data: bochur } = await admin
      .from('bochurim')
      .select('balance')
      .eq('id', topup.bochur_id)
      .eq('archived', false)
      .single()
    newBalance = bochur?.balance ?? 0
  } else {
    // Normal confirm: credit balance and write ledger entry.
    const { data: bochur, error: bochurErr } = await admin
      .from('bochurim')
      .select('balance')
      .eq('id', topup.bochur_id)
      .eq('archived', false)
      .single()

    if (bochurErr || !bochur) {
      return NextResponse.json({ error: 'Bochur not found' }, { status: 404 })
    }

    newBalance = Math.round((bochur.balance + topup.amount) * 100) / 100

    // Apply balance update
    const { error: balanceErr } = await admin
      .from('bochurim')
      .update({ balance: newBalance })
      .eq('id', topup.bochur_id)

    if (balanceErr) {
      console.error('[topup-confirm] Balance update error:', balanceErr.message)
      return NextResponse.json({ error: 'Failed to update balance' }, { status: 500 })
    }

    // Ledger entry
    await admin.from('balance_ledger').insert({
      bochur_id: topup.bochur_id,
      amount: topup.amount,
      type: 'topup',
      note: `${topup.method} top-up${topup.sender_name ? ` from ${topup.sender_name}` : ''}`,
      cashier_id: auth.user.id,
    })
  }

  // Send approval email — awaited; fire-and-forget on Vercel freezes the
  // function mid-send and delays delivery until the instance thaws
  if (process.env.RESEND_API_KEY && topup.parent_email) {
    try {
      const { data: settingsRows } = await admin.from('settings').select('key, value')
      const rawSettings: Record<string, string> = {}
      settingsRows?.forEach((r: any) => { rawSettings[r.key] = r.value == null ? '' : String(r.value) })
      const emailSettings = buildEmailSettings(rawSettings)
      const sent = await sendTopupApproved({
        parentEmail: topup.parent_email!,
        parentName: topup.sender_name || 'Parent',
        studentName: topup.student_name || 'your son',
        amount: topup.amount,
        newBalance,
        emailSettings,
      })
      if (sent) await admin.from('balance_topups').update({ approved_email_sent_at: new Date().toISOString() }).eq('id', topupId)
    } catch (e) {
      console.error('[topup-confirm] Email error:', e)
    }
  }

  return NextResponse.json({ ok: true, skipped_credit: skipCredit })
}

/**
 * PATCH /api/admin/topup-confirm
 * Rejects a pending top-up. Admin or cashier role required.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireCashier()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const topupId = typeof body.topup_id === 'string' ? body.topup_id.trim() : ''
  if (!topupId) return NextResponse.json({ error: 'topup_id is required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: topup } = await admin
    .from('balance_topups')
    .select('status, amount, sender_name, student_name, parent_email')
    .eq('id', topupId)
    .single()

  if (!topup) return NextResponse.json({ error: 'Top-up not found' }, { status: 404 })
  if (topup.status !== 'pending') {
    return NextResponse.json({ error: `Top-up is already ${topup.status}` }, { status: 409 })
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim() : undefined

  await admin.from('balance_topups').update({ status: 'rejected' }).eq('id', topupId)

  // Send rejection email — awaited; fire-and-forget on Vercel freezes the
  // function mid-send and delays delivery until the instance thaws
  if (process.env.RESEND_API_KEY && topup.parent_email) {
    try {
      const { data: settingsRows } = await admin.from('settings').select('key, value')
      const rawSettings: Record<string, string> = {}
      settingsRows?.forEach((r: any) => { rawSettings[r.key] = r.value == null ? '' : String(r.value) })
      const emailSettings = buildEmailSettings(rawSettings)
      const sent = await sendTopupRejected({
        parentEmail: topup.parent_email!,
        parentName: topup.sender_name || 'Parent',
        studentName: topup.student_name || 'your son',
        amount: topup.amount,
        reason: reason || undefined,
        emailSettings,
      })
      if (sent) await admin.from('balance_topups').update({ rejected_email_sent_at: new Date().toISOString() }).eq('id', topupId)
    } catch (e) {
      console.error('[topup-reject] Email error:', e)
    }
  }

  return NextResponse.json({ ok: true })
}

/**
 * PUT /api/admin/topup-confirm
 * Links a top-up to a bochur. Admin or cashier role required.
 */
export async function PUT(req: NextRequest) {
  const auth = await requireCashier()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const topupId = typeof body.topup_id === 'string' ? body.topup_id.trim() : ''
  const bochurId = typeof body.bochur_id === 'string' ? body.bochur_id.trim() : ''
  if (!topupId || !bochurId) {
    return NextResponse.json({ error: 'topup_id and bochur_id are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify bochur exists
  const { data: bochur } = await admin
    .from('bochurim')
    .select('id')
    .eq('id', bochurId)
    .eq('archived', false)
    .single()
  if (!bochur) return NextResponse.json({ error: 'Bochur not found' }, { status: 404 })

  await admin.from('balance_topups').update({ bochur_id: bochurId }).eq('id', topupId)
  return NextResponse.json({ ok: true })
}
