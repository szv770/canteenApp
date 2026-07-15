import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { performVoid } from '@/lib/pos/voidOrder'

// Lets a cashier undo their own order within a short grace window right after
// Quick Charge — without going through admin void. Deliberately narrower than
// the admin void route: own orders only, recent orders only, capped per day,
// and never on an order charged to the cashier's own linked bochur account
// (that combo — ring self up, then "undo" — would let a cashier keep an item
// for free while it looks like a clean void instead of a comp).
const GRACE_WINDOW_MS = 12_000
const MAX_SELF_VOIDS_PER_DAY = 10

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { order_id } = await req.json()
  if (!order_id) return NextResponse.json({ error: 'order_id required' }, { status: 400 })

  const admin = createAdminClient()

  const { data: cashierRow } = await admin
    .from('cashier_profiles')
    .select('bochur_id')
    .eq('id', user.id)
    .single()

  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select('id, status, bochur_id, cashier_id, created_at')
    .eq('id', order_id)
    .single()

  if (orderErr || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.cashier_id !== user.id) {
    return NextResponse.json({ error: 'You can only undo your own orders' }, { status: 403 })
  }
  if (order.status !== 'completed') {
    return NextResponse.json({ error: 'This order can no longer be undone' }, { status: 400 })
  }

  const ageMs = Date.now() - new Date(order.created_at).getTime()
  if (ageMs > GRACE_WINDOW_MS) {
    return NextResponse.json({ error: 'Undo window has expired — ask an admin to void this order instead' }, { status: 400 })
  }

  if (cashierRow?.bochur_id && order.bochur_id && cashierRow.bochur_id === order.bochur_id) {
    return NextResponse.json(
      { error: "Can't undo an order charged to your own account — ask another cashier, or file a refund request" },
      { status: 403 }
    )
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await admin
    .from('balance_ledger')
    .select('id', { count: 'exact', head: true })
    .eq('cashier_id', user.id)
    .eq('method', 'self_void')
    .gte('created_at', since)

  if ((count ?? 0) >= MAX_SELF_VOIDS_PER_DAY) {
    return NextResponse.json(
      { error: 'Daily self-undo limit reached — ask an admin to void this order instead' },
      { status: 429 }
    )
  }

  const result = await performVoid(admin, order_id, user.id, 'self_void')
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ success: true, refunded: result.refunded })
}
