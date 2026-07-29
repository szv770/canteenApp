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
    // maybeSingle + a real error check: swallowing a failure here silently
    // falls back to camper pricing for a staff member (and drops the "Staff
    // price" badge), so the price shown wouldn't match what placePreorder
    // actually charges. A transient DB error must read as an error, not as a
    // different price.
    const { data: bochur, error: bochurError } = await admin
      .from('bochurim')
      .select('account_types(discount_type, discount_value, is_staff_pricing_tier, is_active)')
      .eq('id', bochurId)
      .eq('archived', false)
      .maybeSingle()
    if (bochurError) {
      console.error('preorders/public/items: failed to load account type', bochurError)
      return NextResponse.json({ error: 'Failed to load items' }, { status: 500 })
    }
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
    const { data: existingItems, error: capError } = await admin
      .from('preorder_items')
      .select('product_id, quantity, preorders!inner(for_date, status, bochur_id)')
      .in('product_id', productIds)
      .eq('preorders.for_date', forDate)
      .neq('preorders.status', 'cancelled')
    if (capError) console.error('preorders/public/items: failed to load committed quantities', capError)
    for (const row of (existingItems || []) as any[]) {
      // This person's own still-pending order for the date is excluded, because
      // both ordering surfaces edit that order in place — placePreorder's cap
      // check excludes it too (`row.preorder_id !== existingPreorderId`).
      // Counting it here instead would show someone their own order as other
      // people's demand: an item they'd taken the last of would read "Sold out"
      // and become impossible to re-add after removing it from their own cart.
      if (bochurId && row.preorders?.bochur_id === bochurId && row.preorders?.status === 'pending') continue
      capMap.set(row.product_id, (capMap.get(row.product_id) || 0) + Number(row.quantity))
    }
  }

  // Active add-ons for every orderable product, batched into one query —
  // mirrors the POS's preloaded-addons pattern rather than a query per product.
  const addonsByProduct = new Map<string, { id: string; name: string; price_addition: number }[]>()
  if (productIds.length > 0) {
    const { data: addons, error: addonsError } = await admin
      .from('product_addons')
      .select('id, product_id, name, price_addition')
      .in('product_id', productIds)
      .eq('is_active', true)
      .order('sort_order')
    if (addonsError) {
      console.error('preorders/public/items: failed to load add-ons', addonsError)
      return NextResponse.json({ error: 'Failed to load items' }, { status: 500 })
    }
    for (const a of (addons || []) as any[]) {
      const list = addonsByProduct.get(a.product_id) || []
      list.push({ id: a.id, name: a.name, price_addition: Number(a.price_addition) })
      addonsByProduct.set(a.product_id, list)
    }
  }

  // Categories, scoped to just the orderable items (so the picker's category
  // row only ever offers categories that actually have something in them).
  // Entirely non-fatal: a failure here costs the filter row, never the menu.
  const categoryIdsByProduct = new Map<string, string[]>()
  let categories: any[] = []
  if (productIds.length > 0) {
    const { data: links, error: linksError } = await admin
      .from('product_categories')
      .select('product_id, category_id')
      .in('product_id', productIds)
    if (linksError) console.error('preorders/public/items: failed to load category links', linksError)
    const usedCategoryIds = new Set<string>()
    for (const l of (links || []) as any[]) {
      const list = categoryIdsByProduct.get(l.product_id) || []
      list.push(l.category_id)
      categoryIdsByProduct.set(l.product_id, list)
      usedCategoryIds.add(l.category_id)
    }
    if (usedCategoryIds.size > 0) {
      const { data: cats, error: catsError } = await admin
        .from('categories')
        .select('id, name, color, parent_id, sort_order, is_active')
        .eq('is_active', true)
        .order('sort_order')
      if (catsError) console.error('preorders/public/items: failed to load categories', catsError)
      // Keep the categories in use plus their parents, so a subcategory still
      // renders under the right top-level tab.
      const all = (cats || []) as any[]
      const keep = new Set(Array.from(usedCategoryIds))
      for (const c of all) {
        if (keep.has(c.id) && c.parent_id) keep.add(c.parent_id)
      }
      categories = all.filter(c => keep.has(c.id))
    }
  }

  // Combo deals flagged orderable via Preorders. Deliberately selects only
  // name/icon off each component product — no cost_price/staff_price is ever
  // exposed publicly (bundles have no staff-pricing concept at all; they always
  // sell at their flat listed price, same as regular POS checkout).
  const { data: bundleRows, error: bundlesError } = await admin
    .from('product_bundles')
    .select('id, name, description, price, original_price, icon, is_active, sort_order, allow_preorder, bundle_items(id, bundle_id, product_id, quantity, products(name, icon))')
    .eq('allow_preorder', true)
    .eq('is_active', true)
    .order('sort_order')
  if (bundlesError) {
    console.error('preorders/public/items: failed to load bundles', bundlesError)
    return NextResponse.json({ error: 'Failed to load items' }, { status: 500 })
  }

  // Optional pinned message for this specific date ("no meat today", etc.).
  // Non-fatal: a missing note must never block ordering.
  const { data: dateNote, error: dateNoteError } = await admin
    .from('preorder_date_notes')
    .select('message')
    .eq('for_date', forDate)
    .maybeSingle()
  if (dateNoteError) console.error('preorders/public/items: failed to load date note', dateNoteError)

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
      addons: addonsByProduct.get(p.id) || [],
      category_ids: categoryIdsByProduct.get(p.id) || [],
    }
  })

  return NextResponse.json({
    items,
    bundles: bundleRows || [],
    categories,
    date_note: dateNote?.message ?? null,
  })
}
