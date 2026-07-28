import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { placePreorder } from '@/lib/preorderPlace'

async function requireCashier() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('cashier_profiles').select('id, is_active').eq('id', user.id).single()
  if (!data || !data.is_active) return null
  return { user }
}

export async function POST(req: NextRequest) {
  const auth = await requireCashier()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  // A cart line is either a product (optionally with add-ons) or a bundle.
  // Forwarded through as-is — placePreorder is the single place that decides
  // what's actually orderable and what it costs; the client never dictates price.
  const items = rawItems
    .filter((i: any) => i && (typeof i.product_id === 'string' || typeof i.bundle_id === 'string'))
    .map((i: any) => ({
      product_id: typeof i.product_id === 'string' ? i.product_id : null,
      bundle_id: typeof i.bundle_id === 'string' ? i.bundle_id : null,
      quantity: Number(i.quantity),
      addon_ids: Array.isArray(i.addon_ids) ? i.addon_ids.filter((a: any) => typeof a === 'string') : undefined,
    }))

  const admin = createAdminClient()
  const result = await placePreorder(admin, {
    bochurId, forDate, items,
    placedVia: 'pos',
    cashierId: auth.user.id,
    existingPreorderId,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(
    { ok: true, preorder_id: result.preorderId, total: result.total, staff_pricing_applied: result.staffPricingApplied },
    { status: result.status }
  )
}
