import type { SupabaseClient } from '@supabase/supabase-js'

// "What do I owe the 3rd-party vendor right now" — accrues cost_price × qty
// for vendor-sourced preorder line items, either the moment you send the
// day's order to the vendor or only once each order is confirmed-received
// (admin's choice, Settings → Preorders). Paid-down amount comes from
// withdrawal_log rows tagged reason='vendor_payment' — reuses the existing
// Accounts withdrawal log rather than a new payments table.

export type VendorAccrualMode = 'on_send' | 'on_confirmed_received'

export interface VendorLedgerSummary {
  owed: number
  paid: number
  balance: number
  accrualMode: VendorAccrualMode
}

export async function computeVendorLedger(supabase: SupabaseClient): Promise<VendorLedgerSummary> {
  const { data: modeSetting } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'preorder_vendor_debt_accrual_mode')
    .single()
  const accrualMode: VendorAccrualMode =
    String(modeSetting?.value ?? 'on_send').replace(/"/g, '') === 'on_confirmed_received'
      ? 'on_confirmed_received'
      : 'on_send'

  const { data: preorders } = await supabase
    .from('preorders')
    .select('status, sent_to_vendor, preorder_items(cost_price, quantity, preorder_source)')
    .neq('status', 'cancelled')

  let owed = 0
  for (const po of (preorders || []) as any[]) {
    const qualifies = accrualMode === 'on_send' ? po.sent_to_vendor : po.status === 'received'
    if (!qualifies) continue
    for (const item of (po.preorder_items || []) as any[]) {
      if (item.preorder_source !== 'vendor') continue
      owed += Number(item.cost_price ?? 0) * Number(item.quantity ?? 0)
    }
  }
  owed = Math.round(owed * 100) / 100

  const { data: payments } = await supabase
    .from('withdrawal_log')
    .select('amount')
    .eq('reason', 'vendor_payment')
  const paid = Math.round(((payments || []).reduce((sum: number, p: any) => sum + Number(p.amount), 0)) * 100) / 100

  return { owed, paid, balance: Math.round((owed - paid) * 100) / 100, accrualMode }
}
