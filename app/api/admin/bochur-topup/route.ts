import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/admin/bochur-topup
 * Admin/cashier manually adds funds to a bochur's balance.
 *
 * DB-side RLS recommendation:
 *   bochurim: only authenticated cashiers/admins may UPDATE balance.
 *   balance_ledger: only authenticated cashiers/admins may INSERT.
 */

const MAX_TOPUP = 50_000
const MIN_TOPUP = 0.01
const ALLOWED_METHODS = ['cash', 'zelle', 'venmo', 'paypal', 'manual'] as const

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

  const bochurId = typeof body.bochur_id === 'string' ? body.bochur_id.trim() : ''
  if (!bochurId) return NextResponse.json({ error: 'bochur_id is required' }, { status: 400 })

  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount < MIN_TOPUP || amount > MAX_TOPUP) {
    return NextResponse.json(
      { error: `Amount must be between $${MIN_TOPUP} and $${MAX_TOPUP}` },
      { status: 400 }
    )
  }
  const sanitizedAmount = Math.round(amount * 100) / 100

  const methodRaw = String(body.method || 'cash')
  if (!ALLOWED_METHODS.includes(methodRaw as typeof ALLOWED_METHODS[number])) {
    return NextResponse.json({ error: 'Invalid method' }, { status: 400 })
  }
  const method = methodRaw as typeof ALLOWED_METHODS[number]

  const noteRaw = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : ''
  const note = noteRaw || `${method} top-up`

  const admin = createAdminClient()

  // Fetch current balance
  const { data: bochur, error: bochurErr } = await admin
    .from('bochurim')
    .select('balance')
    .eq('id', bochurId)
    .eq('archived', false)
    .single()

  if (bochurErr || !bochur) {
    return NextResponse.json({ error: 'Bochur not found' }, { status: 404 })
  }

  const newBalance = Math.round((bochur.balance + sanitizedAmount) * 100) / 100

  const { error: updateErr } = await admin
    .from('bochurim')
    .update({ balance: newBalance })
    .eq('id', bochurId)

  if (updateErr) {
    console.error('[bochur-topup] Balance update error:', updateErr.message)
    return NextResponse.json({ error: 'Failed to update balance' }, { status: 500 })
  }

  await admin.from('balance_ledger').insert({
    bochur_id: bochurId,
    amount: sanitizedAmount,
    type: 'topup',
    note,
    cashier_id: auth.user.id,
  })

  return NextResponse.json({ ok: true, new_balance: newBalance })
}
