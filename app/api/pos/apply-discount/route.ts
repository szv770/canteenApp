import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const code = typeof body.code === 'string' ? body.code.trim() : ''
  const subtotal = typeof body.subtotal === 'number' ? body.subtotal : 0

  if (!code) {
    return NextResponse.json({ valid: false, error: 'No code provided' })
  }

  const admin = createAdminClient()

  const { data: dc } = await admin
    .from('discount_codes')
    .select('*')
    .ilike('code', code)
    .single()

  if (!dc) {
    return NextResponse.json({ valid: false, error: 'Invalid discount code' })
  }

  if (!dc.is_active) {
    return NextResponse.json({ valid: false, error: 'This code is no longer active' })
  }

  if (dc.expires_at && new Date(dc.expires_at) <= new Date()) {
    return NextResponse.json({ valid: false, error: 'This code has expired' })
  }

  if (dc.max_uses != null && dc.uses_count >= dc.max_uses) {
    return NextResponse.json({ valid: false, error: 'This code has reached its usage limit' })
  }

  if (subtotal < dc.min_order_amount) {
    return NextResponse.json({
      valid: false,
      error: `Minimum order amount of $${dc.min_order_amount.toFixed(2)} required`,
    })
  }

  let discount_amount: number
  if (dc.type === 'percent') {
    discount_amount = Math.round(subtotal * (dc.value / 100) * 100) / 100
  } else {
    discount_amount = Math.round(Math.min(dc.value, subtotal) * 100) / 100
  }

  return NextResponse.json({
    valid: true,
    discount_amount,
    description: dc.description || dc.code,
    code: dc.code,
  })
}
