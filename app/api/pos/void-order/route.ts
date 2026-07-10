import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

  // Fetch the order
  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select('id, status, bochur_id, total')
    .eq('id', order_id)
    .single()

  if (orderErr || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status !== 'completed') {
    return NextResponse.json({ error: 'Only completed orders can be voided' }, { status: 400 })
  }

  // Check if any payment was made via balance
  const { data: payments } = await admin
    .from('payments')
    .select('method, amount')
    .eq('order_id', order_id)

  const balancePayment = payments?.find(p => p.method === 'balance')

  // Refund balance if applicable
  if (balancePayment && order.bochur_id) {
    const { data: bochur } = await admin
      .from('bochurim')
      .select('balance')
      .eq('id', order.bochur_id)
      .single()

    if (bochur) {
      const newBalance = Math.round((bochur.balance + balancePayment.amount) * 100) / 100

      await admin
        .from('bochurim')
        .update({ balance: newBalance })
        .eq('id', order.bochur_id)

      await admin.from('balance_ledger').insert({
        bochur_id: order.bochur_id,
        amount: balancePayment.amount,
        type: 'refund',
        method: 'void',
        order_id: order_id,
        note: `Void of order #${order_id}`,
        cashier_id: user.id,
      })
    }
  }

  // Mark order as voided
  const { error: voidErr } = await admin
    .from('orders')
    .update({ status: 'voided' })
    .eq('id', order_id)

  if (voidErr) return NextResponse.json({ error: voidErr.message }, { status: 500 })

  return NextResponse.json({ success: true, refunded: balancePayment?.amount ?? 0 })
}
