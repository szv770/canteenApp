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

export async function POST(req: NextRequest) {
  const caller = await requireAdmin()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, email, password, role } = await req.json()
  if (!name || !email || !password) {
    return NextResponse.json({ error: 'name, email, and password are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (authErr || !authData.user) {
    return NextResponse.json({ error: authErr?.message || 'Failed to create user' }, { status: 400 })
  }

  const { error: profileErr } = await admin
    .from('cashier_profiles')
    .insert({ id: authData.user.id, name, role: role || 'cashier', is_active: true })

  if (profileErr) {
    await admin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profileErr.message }, { status: 400 })
  }

  return NextResponse.json({ id: authData.user.id })
}

export async function PATCH(req: NextRequest) {
  const caller = await requireAdmin()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, name, role, is_active, password } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = createAdminClient()

  const profileUpdate: Record<string, unknown> = {}
  if (name !== undefined) profileUpdate.name = name
  if (role !== undefined) profileUpdate.role = role
  if (is_active !== undefined) profileUpdate.is_active = is_active

  if (Object.keys(profileUpdate).length > 0) {
    const { error } = await admin.from('cashier_profiles').update(profileUpdate).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (password) {
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
