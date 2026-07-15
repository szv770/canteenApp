import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('cashier_profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (data?.role !== 'admin') return null
  return user
}

const ALLOWED_ROLES = ['admin', 'cashier'] as const
type AllowedRole = typeof ALLOWED_ROLES[number]

export async function POST(req: NextRequest) {
  const caller = await requireAdmin()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, email, password } = body
  const roleRaw = String(body.role || 'cashier')

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!email || typeof email !== 'string' || !email.trim()) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }
  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'password is required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }
  if (!ALLOWED_ROLES.includes(roleRaw as AllowedRole)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }
  const role = roleRaw as AllowedRole

  // Basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email.trim())) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
  })
  if (authErr || !authData.user) {
    return NextResponse.json({ error: authErr?.message || 'Failed to create user' }, { status: 400 })
  }

  const { error: profileErr } = await admin
    .from('cashier_profiles')
    .insert({ id: authData.user.id, name: name.trim(), role, is_active: true })

  if (profileErr) {
    await admin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profileErr.message }, { status: 400 })
  }

  return NextResponse.json({ id: authData.user.id })
}

export async function PATCH(req: NextRequest) {
  const caller = await requireAdmin()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, name, is_active, password } = body
  if (!id || typeof id !== 'string') return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Validate role if provided
  let role: AllowedRole | undefined
  if (body.role !== undefined) {
    if (!ALLOWED_ROLES.includes(body.role as AllowedRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }
    role = body.role as AllowedRole
  }

  // Validate password if provided
  if (password !== undefined && password !== null && password !== '') {
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }
  }

  const admin = createAdminClient()

  // Special action: payout_tips — credit tip balance to linked bochur account and zero tip_balance
  if (body.action === 'payout_tips') {
    const { data: cashierRow, error: cashierFetchErr } = await admin
      .from('cashier_profiles')
      .select('tip_balance, bochur_id')
      .eq('id', id)
      .single()
    if (cashierFetchErr || !cashierRow) {
      return NextResponse.json({ error: 'Cashier not found' }, { status: 404 })
    }
    const tipAmount = Number(cashierRow.tip_balance || 0)
    if (tipAmount <= 0) {
      return NextResponse.json({ error: 'No tips to pay out' }, { status: 400 })
    }
    if (!cashierRow.bochur_id) {
      return NextResponse.json({ error: 'no_bochur_linked' }, { status: 400 })
    }
    // Credit the tip amount to the linked bochur balance
    const { data: bochurRow, error: bochurFetchErr } = await admin
      .from('bochurim')
      .select('balance')
      .eq('id', cashierRow.bochur_id)
      .single()
    if (bochurFetchErr || !bochurRow) {
      return NextResponse.json({ error: 'Linked bochur account not found' }, { status: 404 })
    }
    const newBalance = Math.round((Number(bochurRow.balance) + tipAmount) * 100) / 100
    const { error: balErr } = await admin
      .from('bochurim')
      .update({ balance: newBalance })
      .eq('id', cashierRow.bochur_id)
    if (balErr) return NextResponse.json({ error: balErr.message }, { status: 500 })

    await admin.from('balance_ledger').insert({
      bochur_id: cashierRow.bochur_id,
      amount: tipAmount,
      type: 'topup',
      note: 'Tip payout from cashier tip balance',
      cashier_id: id,
    })

    // Zero out the cashier tip_balance
    await admin.from('cashier_profiles').update({ tip_balance: 0 }).eq('id', id)

    return NextResponse.json({ ok: true, amount: tipAmount })
  }

  // Special action: payout_tips_cash — cashier has no linked bochur account,
  // so the tip pool is handed to them as physical cash. Previously this just
  // zeroed tip_balance with zero record anywhere; now it also logs a
  // withdrawal so the cash leaving the register shows up in Accounts.
  if (body.action === 'payout_tips_cash') {
    const { data: cashierRow, error: cashierFetchErr } = await admin
      .from('cashier_profiles')
      .select('name, tip_balance')
      .eq('id', id)
      .single()
    if (cashierFetchErr || !cashierRow) {
      return NextResponse.json({ error: 'Cashier not found' }, { status: 404 })
    }
    const tipAmount = Number(cashierRow.tip_balance || 0)
    if (tipAmount <= 0) {
      return NextResponse.json({ error: 'No tips to pay out' }, { status: 400 })
    }

    // Local (America/New_York) calendar date, not the server's UTC date —
    // this route runs on Vercel's Node runtime (defaults to UTC), and a
    // plain `.toISOString().slice(0,10)` would misdate evening payouts by a
    // day (same UTC-vs-local class of bug as gotcha #19/#25).
    const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const pad = (n: number) => String(n).padStart(2, '0')
    const todayLocal = `${nowInTz.getFullYear()}-${pad(nowInTz.getMonth() + 1)}-${pad(nowInTz.getDate())}`

    await admin.from('withdrawal_log').insert({
      account: 'cash',
      amount: tipAmount,
      date: todayLocal,
      reason: 'other',
      note: `Tip payout to ${cashierRow.name} (no linked student account)`,
      recorded_by: caller.id,
    })

    const { error: balErr } = await admin.from('cashier_profiles').update({ tip_balance: 0 }).eq('id', id)
    if (balErr) return NextResponse.json({ error: balErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, amount: tipAmount })
  }

  const profileUpdate: Record<string, unknown> = {}
  if (name !== undefined && typeof name === 'string') profileUpdate.name = name.trim()
  if (role !== undefined) profileUpdate.role = role
  if (is_active !== undefined && typeof is_active === 'boolean') profileUpdate.is_active = is_active
  // bochur_id: allow setting (UUID string) or unsetting (null)
  if ('bochur_id' in body) {
    profileUpdate.bochur_id = body.bochur_id ?? null
  }
  // tip_balance: allow resetting to 0 (mark tips paid out as cash — no bochur credit)
  if ('tip_balance' in body && typeof body.tip_balance === 'number') {
    profileUpdate.tip_balance = body.tip_balance
  }

  if (Object.keys(profileUpdate).length > 0) {
    const { error } = await admin.from('cashier_profiles').update(profileUpdate).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (password && typeof password === 'string' && password.length >= 8) {
    const { error } = await admin.auth.admin.updateUserById(id, { password })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const caller = await requireAdmin()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  if (id === caller.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
