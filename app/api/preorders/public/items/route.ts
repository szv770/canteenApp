import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computePreorderUnitPrice } from '@/lib/preorderPricing'

export const dynamic = 'force-dynamic'

// Public item list for a given date + (optional) matched bochur. Never
// exposes cost_price or the raw staff_price — only the final price this
// specific person would pay, plus a boolean badge so staff pricing is
// acknowledged without ever showing a camper-vs-staff comparison (per
// explicit product direction — see CLAUDE.md).
export async function GET(req: NextRequest) {
  const forDate = req.nextUrl.searchParams.get('for_date') || ''
  const bochurId = req.nextUrl.searchParams.get('bochur_id') || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(forDate)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })

  const admin = createAdminClient()

  let accountType: { discount_type: 'none' | 'percentage' | 'cost_price' | 'fixed'; discount_value: number; is_staff_pricing_tier: boolean } | null = null
  if (bochurId) {
    const { data: bochur } = await admin
      .from('bochurim')
      .select('account_types(discount_type, discount_value, is_staff_pricing_tier, is_active)')
      .eq('id', bochurId)
      .eq('archived', false)
      .single()
    const at = (bochur as any)?.account_types
    if (at && at.is_active) {
      accountType = { discount_type: at.discount_type, discount_value: Number(at.discount_value || 0), is_staff_pricing_tier: !!at.is_staff_pricing_tier }
    }
  }

  const { data: products, error: productsError } = await admin
    .from('products')
    .select('id, name, icon, image_url, price, cost_price, staff_price, preorder_source, preorder_daily_cap')
    .eq('allow_preorder', true)
    .eq('is_active', true)
    .order('name')

  // Surface a failed query as a real error instead of silently returning
  // `{ items: [] }` — a swallowed error here reads identically to "nothing is
  // orderable right now" client-side, which is exactly the confusing "my
  // preorder item isn't showing up" symptom. See CLAUDE.md Preorders task notes.
  if (productsError) {
    console.error('preorders/public/items: failed to load products', productsError)
    return NextResponse.json({ error: 'Failed to load items' }, { status: 500 })
  }

  const productIds = (products || []).map((p: any) => p.id)
  const capMap = new Map<string, number>()
  if (productIds.length > 0) {
    const { data: existingItems } = await admin
      .from('preorder_items')
      .select('product_id, quantity, preorders!inner(for_date, status)')
      .in('product_id', productIds)
      .eq('preorders.for_date', forDate)
      .neq('preorders.status', 'cancelled')
    for (const row of (existingItems || []) as any[]) {
      capMap.set(row.product_id, (capMap.get(row.product_id) || 0) + Number(row.quantity))
    }
  }

  const items = (products || []).map((p: any) => {
    const { unitPrice, staffPricingApplied } = computePreorderUnitPrice(
      { price: Number(p.price), cost_price: p.cost_price != null ? Number(p.cost_price) : null, staff_price: p.staff_price != null ? Number(p.staff_price) : null },
      accountType
    )
    const remaining = p.preorder_daily_cap != null ? Math.max(0, p.preorder_daily_cap - (capMap.get(p.id) || 0)) : null
    return {
      id: p.id,
      name: p.name,
      icon: p.icon,
      image_url: p.image_url,
      price: unitPrice,
      staff_pricing_applied: staffPricingApplied,
      preorder_source: p.preorder_source,
      remaining_cap: remaining,
    }
  })

  return NextResponse.json({ items })
}
