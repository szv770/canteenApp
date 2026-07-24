import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { placePreorder } from '@/lib/preorderPlace'

export async function POST(req: NextRequest) {
  const admin = createAdminClient()

  const { data: enabledSetting } = await admin.from('settings').select('value').eq('key', 'preorder_public_link_enabled').single()
  const enabled = enabledSetting?.value !== false && String(enabledSetting?.value ?? 'true').replace(/"/g, '') !== 'false'
  if (!enabled) return NextResponse.json({ error: 'Online ordering is currently unavailable.' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const bochurId = typeof body.bochur_id === 'string' ? body.bochur_id : ''
  const forDate = typeof body.for_date === 'string' ? body.for_date : ''
  const rawItems = Array.isArray(body.items) ? body.items : []
  const existingPreorderId = typeof body.preorder_id === 'string' ? body.preorder_id : null

  const items = rawItems
    .filter((i: any) => i && typeof i.product_id === 'string')
    .map((i: any) => ({ product_id: i.product_id, quantity: Number(i.quantity) }))

  const result = await placePreorder(admin, {
    bochurId, forDate, items,
    placedVia: 'public_link',
    cashierId: null,
    existingPreorderId,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(
    { ok: true, preorder_id: result.preorderId, total: result.total, staff_pricing_applied: result.staffPricingApplied },
    { status: result.status }
  )
}
