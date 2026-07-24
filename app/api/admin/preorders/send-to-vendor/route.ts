import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Marks every pending vendor-sourced preorder for a date as "sent to vendor"
// (so the daily list can't be re-sent by accident) and returns a formatted
// summary — camper/staff split per item — ready to copy or WhatsApp to the
// vendor. Admin-only since this is also the moment debt can accrue (see
// preorder_vendor_debt_accrual_mode in Settings).

async function requireAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('cashier_profiles').select('id, role, is_active').eq('id', user.id).single()
  if (!data || !data.is_active || data.role !== 'admin') return null
  return { user }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const forDate = typeof body.for_date === 'string' ? body.for_date : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(forDate)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })

  const admin = createAdminClient()

  const { data: preorders } = await admin
    .from('preorders')
    .select('id, is_staff_pricing, preorder_items(product_name, quantity, preorder_source)')
    .eq('for_date', forDate)
    .eq('status', 'pending')

  // Only vendor-sourced items go to the vendor; in-house items are a prep
  // list, not something to send anywhere.
  const tally = new Map<string, { camper: number; staff: number }>()
  const ids: string[] = []
  for (const po of (preorders || []) as any[]) {
    ids.push(po.id)
    for (const item of (po.preorder_items || []) as any[]) {
      if (item.preorder_source !== 'vendor') continue
      const key = item.product_name
      const entry = tally.get(key) || { camper: 0, staff: 0 }
      if (po.is_staff_pricing) entry.staff += item.quantity
      else entry.camper += item.quantity
      tally.set(key, entry)
    }
  }

  if (ids.length > 0) {
    await admin.from('preorders').update({ sent_to_vendor: true, sent_to_vendor_at: new Date().toISOString() }).in('id', ids)
  }

  const lines: string[] = [`Order for ${forDate}:`]
  let totalUnits = 0
  for (const [name, counts] of Array.from(tally.entries())) {
    const total = counts.camper + counts.staff
    totalUnits += total
    lines.push(`- ${name} ×${total} (${counts.camper} camper, ${counts.staff} staff)`)
  }
  if (tally.size === 0) lines.push('(no vendor items in this batch)')
  lines.push(`Total items: ${totalUnits}`)

  return NextResponse.json({ ok: true, summary: lines.join('\n'), orders_marked: ids.length })
}
