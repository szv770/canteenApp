import { NextResponse } from 'next/server'
import { getAutoTopSellers } from '@/lib/home'

export const dynamic = 'force-dynamic'

// Public endpoint — parents' home page "Popular right now" section.
// Only ever returns product name + icon for active products, ranked by
// recent sales volume. No prices, costs, quantities, or order/customer
// data are exposed.
export async function GET() {
  const items = await getAutoTopSellers()
  return NextResponse.json({ items })
}
