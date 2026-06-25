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

  const profileUpdate: Record<string, unknown> = {}
  if (name !== undefined && typeof name === 'string') profileUpdate.name = name.trim()
  if (role !== undefined) profileUpdate.role = role
  if (is_active !== undefined && typeof is_active === 'boolean') profileUpdate.is_active = is_active

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
