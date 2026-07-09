import { createAdminClient } from '@/lib/supabase/admin'

const TOP_SELLERS_WINDOW_DAYS = 30
const TOP_SELLERS_LIMIT = 5

export interface TopSellerItem {
  name: string
  icon: string | null
}

// Public-safe aggregate: only returns product name + icon for active
// products, ranked by recent sales volume. No prices, costs, quantities,
// or order/customer data are ever exposed to the caller.
export async function getAutoTopSellers(): Promise<TopSellerItem[]> {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - TOP_SELLERS_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: items, error } = await admin
    .from('order_items')
    .select('product_id, quantity, orders!inner(status, created_at)')
    .eq('orders.status', 'completed')
    .gte('orders.created_at', cutoff)

  if (error || !items) return []

  const totals = new Map<string, number>()
  for (const row of items as any[]) {
    if (!row.product_id) continue
    totals.set(row.product_id, (totals.get(row.product_id) || 0) + Number(row.quantity || 0))
  }

  const rankedIds = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_SELLERS_LIMIT)
    .map(([id]) => id)

  if (rankedIds.length === 0) return []

  const { data: products } = await admin
    .from('products')
    .select('id, name, icon')
    .in('id', rankedIds)
    .eq('is_active', true)

  const byId = new Map((products || []).map((p: any) => [p.id, p]))
  return rankedIds
    .map(id => byId.get(id))
    .filter(Boolean)
    .map((p: any) => ({ name: p.name, icon: p.icon }))
}

export interface HomeAnnouncement {
  id: string
  message: string
  type: 'info' | 'warning' | 'urgent'
}

// Public-safe: only exposes id/message/type of an active, non-expired
// notification flagged for the home page. No created_by or other
// internal fields are selected.
export async function getHomeAnnouncement(): Promise<HomeAnnouncement | null> {
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const { data } = await admin
    .from('cashier_notifications')
    .select('id, message, type')
    .eq('is_active', true)
    .eq('show_on_home_page', true)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data as HomeAnnouncement | null
}
