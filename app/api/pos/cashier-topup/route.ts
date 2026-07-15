import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTopupReceived, sendTopupApproved, buildEmailSettings } from '@/lib/email'

const ALLOWED_METHODS = ['cash', 'zelle', 'venmo', 'paypal', 'cashapp', 'credit_card', 'manual'] as const

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('cashier_profiles')
    .select('id, name, role, is_active')
    .eq('id', user.id)
    .single()
  if (!profile || !profile.is_active) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const bochurId = typeof body.bochur_id === 'string' ? body.bochur_id.trim() : ''
  const studentName = typeof body.student_name === 'string' ? body.student_name.trim().slice(0, 100) : ''
  const methodRaw = typeof body.method === 'string' ? body.method.trim() : ''
  const method = ALLOWED_METHODS.includes(methodRaw as any) ? methodRaw : null
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : null
  const emailRaw = typeof body.parent_email === 'string' ? body.parent_email.trim().slice(0, 200) : ''
  const parentEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : null

  if (!bochurId) return NextResponse.json({ error: 'bochur_id is required' }, { status: 400 })
  if (!method) return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })

  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount < 0.01 || amount > 100_000) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
  }
  const sanitizedAmount = Math.round(amount * 100) / 100

  const admin = createAdminClient()

  // Verify bochur exists
  const { data: bochur } = await admin
    .from('bochurim')
    .select('id, name')
    .eq('id', bochurId)
    .eq('archived', false)
    .single()
  if (!bochur) return NextResponse.json({ error: 'Bochur not found' }, { status: 404 })

  const { data: settingsRows } = await admin.from('settings').select('key, value')
  const rawSettings: Record<string, string> = {}
  settingsRows?.forEach((r: any) => { rawSettings[r.key] = r.value == null ? '' : String(r.value) })
  const emailSettings = buildEmailSettings(rawSettings)

  const autoApproveEnabled = rawSettings['cashier_topup_auto_approve_enabled'] === 'true'
  const autoApproveMax = parseFloat(rawSettings['cashier_topup_auto_approve_max'] || '0')
  const wantsAutoApprove = autoApproveEnabled && sanitizedAmount <= autoApproveMax

  const { data: inserted, error } = await admin.from('balance_topups').insert({
    bochur_id: bochurId,
    student_name: studentName || bochur.name,
    sender_name: profile.name || 'Cashier',
    parent_email: parentEmail,
    amount: sanitizedAmount,
    method,
    notes: note ? `Cashier top-up: ${note}` : 'Cashier top-up',
    status: 'pending',
    created_by: user.id,
  }).select('id').single()

  if (error || !inserted) {
    console.error('[cashier-topup]', error?.message)
    return NextResponse.json({ error: 'Failed to submit top-up request' }, { status: 500 })
  }

  // Under the admin-configured threshold: claim + credit immediately, same
  // atomic status-claim pattern as /api/admin/topup-confirm (guards against
  // ever double-crediting). On any failure it falls back to leaving the row
  // pending rather than silently losing the credit.
  let autoApproved = false
  let newBalance = 0

  if (wantsAutoApprove) {
    const { data: claimed } = await admin
      .from('balance_topups')
      .update({
        status: 'confirmed',
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
        payment_received_date: new Date().toISOString().slice(0, 10),
      })
      .eq('id', inserted.id)
      .eq('status', 'pending')
      .select('id')

    if (claimed && claimed.length > 0) {
      const { data: bochurRow, error: bochurErr } = await admin
        .from('bochurim')
        .select('balance')
        .eq('id', bochurId)
        .single()

      if (!bochurErr && bochurRow) {
        newBalance = Math.round((bochurRow.balance + sanitizedAmount) * 100) / 100
        const { error: balErr } = await admin.from('bochurim').update({ balance: newBalance }).eq('id', bochurId)
        if (!balErr) {
          await admin.from('balance_ledger').insert({
            bochur_id: bochurId,
            amount: sanitizedAmount,
            type: 'topup',
            note: `${method} top-up from ${profile.name || 'Cashier'} (auto-approved, under $${autoApproveMax.toFixed(2)} threshold)`,
            cashier_id: user.id,
          })
          autoApproved = true
        } else {
          console.error('[cashier-topup] auto-approve balance update failed:', balErr.message)
        }
      } else {
        console.error('[cashier-topup] auto-approve bochur fetch failed:', bochurErr?.message)
      }

      if (!autoApproved) {
        await admin.from('balance_topups').update({
          status: 'pending', confirmed_by: null, confirmed_at: null, payment_received_date: null,
        }).eq('id', inserted.id)
      }
    }
  }

  // Send parent notification email if an address was provided; stamp timestamp on success.
  // Awaited — fire-and-forget on Vercel freezes the function mid-send and delays delivery.
  if (process.env.RESEND_API_KEY && parentEmail) {
    try {
      if (autoApproved) {
        const sent = await sendTopupApproved({
          parentEmail,
          parentName: studentName || bochur.name,
          studentName: studentName || bochur.name,
          amount: sanitizedAmount,
          newBalance,
          emailSettings,
        })
        if (sent) await admin.from('balance_topups').update({ approved_email_sent_at: new Date().toISOString() }).eq('id', inserted.id)
      } else {
        const sent = await sendTopupReceived({
          parentEmail,
          parentName: studentName || bochur.name,
          studentName: studentName || bochur.name,
          amount: sanitizedAmount,
          method: method!,
          emailSettings,
        })
        if (sent) await admin.from('balance_topups').update({ received_email_sent_at: new Date().toISOString() }).eq('id', inserted.id)
      }
    } catch (e) {
      console.error('[cashier-topup] Email error:', e)
    }
  }

  return NextResponse.json({ ok: true, auto_approved: autoApproved, new_balance: autoApproved ? newBalance : undefined }, { status: 201 })
}
