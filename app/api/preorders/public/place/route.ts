import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { placePreorder } from '@/lib/preorderPlace'

export async function POST(req: NextRequest) {
  const admin = createAdminClient()

  // Absent row / failed read both fall back to "enabled" — the same default the
  // rest of the feature uses — but log it, since a persistent failure here means
  // the admin's kill-switch is silently not being honoured either way.
  const { data: enabledSetting, error: enabledErr } = await admin
    .from('settings').select('value').eq('key', 'preorder_public_link_enabled').maybeSingle()
  if (enabledErr) console.error('preorders/public/place: failed to read public-link setting, defaulting to enabled', enabledErr)
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
