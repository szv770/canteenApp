import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Public, unauthenticated name search for the Preorders link (campers AND
// staff/Shluchim both use this — see CLAUDE.md). Deliberately returns only
// the minimum needed to disambiguate a name and know which pricing tier
// applies — never balance, phone, or notes (same discipline as lib/home.ts,
// see gotcha #10/#16: this table has no anon RLS grant on purpose, so all
// public reads go through this tightly-scoped service-role route instead).
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ results: [] })

  const admin = createAdminClient()
  const { data } = await admin
    .from('bochurim')
    .select('id, name, account_types(is_staff_pricing_tier)')
    .eq('archived', false)
    .ilike('name', `%${q}%`)
    .limit(8)

  const results = (data || []).map((b: any) => ({
    id: b.id,
    name: b.name,
    is_staff: !!b.account_types?.is_staff_pricing_tier,
  }))
  return NextResponse.json({ results })
}
