import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Lets the public link's self-edit flow find "my pending order for this date"
// after re-searching a name — matches the app's existing no-password trust
// model for parent-facing flows (same level as the top-up form).
export async function GET(req: NextRequest) {
  const bochurId = req.nextUrl.searchParams.get('bochur_id') || ''
  const forDate = req.nextUrl.searchParams.get('for_date') || ''
  if (!bochurId || !/^\d{4}-\d{2}-\d{2}$/.test(forDate)) {
    return NextResponse.json({ error: 'bochur_id and for_date are required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: preorder } = await admin
    .from('preorders')
    .select('id, status, total_amount, preorder_items(product_id, product_name, quantity, unit_price)')
    .eq('bochur_id', bochurId)
    .eq('for_date', forDate)
    .eq('status', 'pending')
    .maybeSingle()

  return NextResponse.json({ order: preorder || null })
}
