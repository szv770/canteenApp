import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Powers the public link's "Order the same as last time" quick action: the
// person's most recent non-cancelled preorder, whatever date it was for.
// Returns line items only — never a balance, phone number, or anything else
// off the bochur row — same tight scoping as the rest of /api/preorders/public/*.
export async function GET(req: NextRequest) {
  const bochurId = req.nextUrl.searchParams.get('bochur_id') || ''
  const excludeDate = req.nextUrl.searchParams.get('exclude_date') || ''
  if (!bochurId) return NextResponse.json({ error: 'bochur_id is required' }, { status: 400 })

  const admin = createAdminClient()
  let query = admin
    .from('preorders')
    .select('id, for_date, preorder_items(product_id, bundle_id, product_name, quantity, is_bundle_component, addon_ids, addon_names)')
    .eq('bochur_id', bochurId)
    .neq('status', 'cancelled')
    .order('for_date', { ascending: false })
    .limit(1)
  if (/^\d{4}-\d{2}-\d{2}$/.test(excludeDate)) query = query.neq('for_date', excludeDate)

  const { data, error } = await query
  if (error) {
    console.error('preorders/public/last-order: failed to load previous order', error)
    return NextResponse.json({ order: null })
  }

  return NextResponse.json({ order: data?.[0] ?? null })
}
