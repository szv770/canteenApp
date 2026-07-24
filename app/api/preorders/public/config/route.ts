import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { upcomingOrderableDates } from '@/lib/preorderCutoff'

export const dynamic = 'force-dynamic'

export async function GET() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('settings')
    .select('key, value')
    .in('key', ['preorder_public_link_enabled', 'preorder_cutoff_time'])

  const map: Record<string, string> = {}
  ;(data || []).forEach((s: any) => { map[s.key] = String(s.value).replace(/"/g, '') })
  const enabled = map['preorder_public_link_enabled'] !== 'false'
  const cutoffTime = map['preorder_cutoff_time'] || '20:00'

  return NextResponse.json({ enabled, cutoff_time: cutoffTime, dates: upcomingOrderableDates(cutoffTime) })
}
