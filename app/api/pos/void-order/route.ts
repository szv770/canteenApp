import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { performVoid } from '@/lib/pos/voidOrder'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only admins can void orders
  const admin = createAdminClient()
  const { data: cashierRow } = await admin
    .from('cashier_profiles').select('role').eq('id', user.id).single()
  if (cashierRow?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin role required to void orders' }, { status: 403 })
  }

  const { order_id } = await req.json()
  if (!order_id) return NextResponse.json({ error: 'order_id required' }, { status: 400 })

  const result = await performVoid(admin, order_id, user.id, 'void')
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ success: true, refunded: result.refunded })
}
