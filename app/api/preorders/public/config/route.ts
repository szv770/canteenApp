import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { upcomingOrderableDates } from '@/lib/preorderCutoff'

export const dynamic = 'force-dynamic'

export async function GET() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('settings')
    .select('key, value')
    .in('key', ['preorder_public_link_enabled', 'preorder_cutoff_time', 'preorder_same_day_cutoff_time'])
  if (error) console.error('preorders/public/config: failed to load settings, using defaults', error)

  const map: Record<string, string> = {}
  ;(data || []).forEach((s: any) => { map[s.key] = String(s.value).replace(/"/g, '') })
  const enabled = map['preorder_public_link_enabled'] !== 'false'
  const cutoffTime = map['preorder_cutoff_time'] || '20:00'
  // Governs same-day ("today") orders only; blank/absent falls back to the
  // advance cutoff above inside cutoffDeadlineForDate.
  const sameDayCutoffTime = map['preorder_same_day_cutoff_time'] || undefined

  return NextResponse.json({
    enabled,
    cutoff_time: cutoffTime,
    same_day_cutoff_time: sameDayCutoffTime ?? null,
    dates: upcomingOrderableDates(cutoffTime, undefined, undefined, undefined, sameDayCutoffTime),
  })
}
