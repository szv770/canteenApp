import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

export type VoidResult =
  | { ok: true; refunded: number }
  | { ok: false; status: number; error: string }

// Shared core used by both the admin-only void route and the cashier
// self-void route — refund logic must stay identical between the two so a
// self-voided order looks exactly like an admin-voided one in the ledger.
export async function performVoid(
  admin: AdminClient,
  orderId: string,
  voidedByCashierId: string,
  ledgerMethod: 'void' | 'self_void'
): Promise<VoidResult> {
  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select('id, status, bochur_id, total')
    .eq('id', orderId)
    .single()

  if (orderErr || !order) return { ok: false, status: 404, error: 'Order not found' }
  if (order.status !== 'completed') {
    return { ok: false, status: 400, error: 'Only completed orders can be voided' }
  }

  const { data: payments } = await admin
    .from('payments')
    .select('method, amount')
    .eq('order_id', orderId)

  const balancePayment = payments?.find(p => p.method === 'balance')

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
        method: ledgerMethod,
        order_id: orderId,
        note: `${ledgerMethod === 'self_void' ? 'Self-undo' : 'Void'} of order #${orderId}`,
        cashier_id: voidedByCashierId,
      })
    }
  }

  const { error: voidErr } = await admin
    .from('orders')
    .update({ status: 'voided' })
    .eq('id', orderId)

  if (voidErr) return { ok: false, status: 500, error: voidErr.message }

  return { ok: true, refunded: balancePayment?.amount ?? 0 }
}
