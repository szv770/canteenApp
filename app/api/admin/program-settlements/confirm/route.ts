import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Admin-only: executing a settlement moves real money (or writes off a debt),
// so this stays a deliberate admin action even though cashiers may be able to
// view the balances list itself (gated separately via a Settings toggle).
async function requireAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('cashier_profiles').select('role').eq('id', user.id).single()
  if (data?.role !== 'admin') return null
  return user
}

export async function POST(req: NextRequest) {
  const admin_user = await requireAdmin()
  if (!admin_user) return NextResponse.json({ error: 'Admin role required' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const settlementId = typeof body.settlement_id === 'string' ? body.settlement_id : ''
  if (!settlementId) return NextResponse.json({ error: 'settlement_id is required' }, { status: 400 })

  const admin = createAdminClient()

  // Atomic status-claim (same pattern as topup-confirm) — guards against the
  // same settlement being confirmed twice if double-clicked or two admins
  // act on it at once. Only the request that flips pending -> completed
  // proceeds to touch balance/ledger.
  const { data: claimed } = await admin
    .from('program_settlements')
    .update({ status: 'completed', completed_by: admin_user.id, completed_at: new Date().toISOString() })
    .eq('id', settlementId)
    .eq('status', 'pending')
    .select('*')
    .single()

  if (!claimed) {
    return NextResponse.json({ error: 'Settlement not found or already completed' }, { status: 409 })
  }

  const { data: bochur, error: bochurErr } = await admin
    .from('bochurim')
    .select('balance, name')
    .eq('id', claimed.bochur_id)
    .single()

  if (bochurErr || !bochur) {
    // Roll back the claim so this doesn't silently vanish as "completed" with no effect
    await admin.from('program_settlements').update({ status: 'pending', completed_by: null, completed_at: null }).eq('id', settlementId)
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  const amount = Number(claimed.amount)

  // Ledger type/method must match the exact convention Accounts' Net Balance
  // calc already reads (see accounts/page.tsx loadNetBalances / gotcha #27):
  //  - refund (cash/zelle out to a family): type=refund, method=cash|zelle,
  //    subtracted from that account's total automatically.
  //  - collection (cash/zelle received, paying down a debt): type=topup,
  //    method=cash|zelle, added to that account's total automatically.
  //  - write_off (absorbing an uncollectable debt, no real money moves):
  //    type=adjustment — Accounts never reads this type, so it correctly has
  //    zero effect on any Cash/Zelle/CC total.
  let ledgerType: string
  let ledgerMethod: string | null
  let balanceDelta: number
  if (claimed.direction === 'refund') {
    ledgerType = 'refund'
    ledgerMethod = claimed.method
    balanceDelta = -amount
  } else if (claimed.direction === 'collection') {
    ledgerType = 'topup'
    ledgerMethod = claimed.method
    balanceDelta = amount
  } else {
    ledgerType = 'adjustment'
    ledgerMethod = 'write_off'
    balanceDelta = amount
  }

  const newBalance = Math.round((Number(bochur.balance) + balanceDelta) * 100) / 100

  const { error: balErr } = await admin.from('bochurim').update({ balance: newBalance }).eq('id', claimed.bochur_id)
  if (balErr) {
    await admin.from('program_settlements').update({ status: 'pending', completed_by: null, completed_at: null }).eq('id', settlementId)
    return NextResponse.json({ error: 'Failed to update balance' }, { status: 500 })
  }

  await admin.from('balance_ledger').insert({
    bochur_id: claimed.bochur_id,
    amount: balanceDelta,
    type: ledgerType,
    method: ledgerMethod,
    cashier_id: admin_user.id,
    note: claimed.note
      ? `End of program ${claimed.direction}: ${claimed.note}`
      : `End of program ${claimed.direction} (${claimed.method})`,
  })

  return NextResponse.json({ ok: true, new_balance: newBalance })
}
