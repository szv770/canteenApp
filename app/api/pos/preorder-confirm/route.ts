import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Confirms that a preorder was actually handed to the camper/staff member —
// this is the ONLY moment the balance is charged (see CLAUDE.md: placing an
// order never touches balance, only receiving it does). Mirrors the balance
// checks in /api/pos/checkout so a preorder charge can't push someone past
// their negative-balance limit any more than a regular sale could.

async function requireCashier() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('cashier_profiles').select('id, is_active').eq('id', user.id).single()
  if (!data || !data.is_active) return null
  return { user }
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
  const preorderId = typeof body.preorder_id === 'string' ? body.preorder_id : ''
  if (!preorderId) return NextResponse.json({ error: 'preorder_id is required' }, { status: 400 })

  const admin = createAdminClient()

  const { data: preorder } = await admin
    .from('preorders')
    .select('id, bochur_id, status, total_amount, for_date')
    .eq('id', preorderId)
    .single()
  if (!preorder) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (preorder.status === 'received') return NextResponse.json({ error: 'Already confirmed' }, { status: 400 })
  if (preorder.status === 'cancelled') return NextResponse.json({ error: 'This order was cancelled' }, { status: 400 })

  const { data: bochur } = await admin
    .from('bochurim')
    .select('id, name, balance, allow_negative, max_negative_balance, is_frozen, banned_until')
    .eq('id', preorder.bochur_id)
    .single()
  if (!bochur) return NextResponse.json({ error: 'Bochur not found' }, { status: 400 })
  if (bochur.is_frozen) return NextResponse.json({ error: 'This account is frozen. Please contact an admin.' }, { status: 403 })
  if (bochur.banned_until && new Date(bochur.banned_until) > new Date()) {
    return NextResponse.json({ error: 'This account is temporarily restricted.' }, { status: 403 })
  }

  const total = Number(preorder.total_amount)
  const balanceAfter = Math.round((Number(bochur.balance) - total) * 100) / 100
  const blocked = balanceAfter < 0 && (!bochur.allow_negative || -balanceAfter > Number(bochur.max_negative_balance))
  if (blocked) {
    return NextResponse.json({
      error: 'Insufficient balance',
      shortfall: Math.round(-balanceAfter * 100) / 100,
      bochur_name: bochur.name,
    }, { status: 402 })
  }

  await admin.from('bochurim').update({ balance: balanceAfter }).eq('id', bochur.id)
  await admin.from('balance_ledger').insert({
    bochur_id: bochur.id,
    amount: -total,
    type: 'purchase',
    method: 'preorder',
    cashier_id: auth.user.id,
    note: `Preorder for ${preorder.for_date}`,
  })
  await admin.from('preorders').update({
    status: 'received',
    confirmed_at: new Date().toISOString(),
    confirmed_by: auth.user.id,
  }).eq('id', preorderId)

  return NextResponse.json({ ok: true, charged: total, bochur_name: bochur.name })
}
