import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isBeforeCutoff } from '@/lib/preorderCutoff'

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const preorderId = typeof body.preorder_id === 'string' ? body.preorder_id : ''
  const bochurId = typeof body.bochur_id === 'string' ? body.bochur_id : ''
  if (!preorderId || !bochurId) return NextResponse.json({ error: 'preorder_id and bochur_id are required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: preorder, error: preorderErr } = await admin.from('preorders').select('id, bochur_id, for_date, status').eq('id', preorderId).single()
  if (preorderErr) console.error('preorders/public/cancel: failed to load order', preorderErr)
  if (!preorder || preorder.bochur_id !== bochurId) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (preorder.status !== 'pending') return NextResponse.json({ error: 'This order can no longer be cancelled' }, { status: 400 })

  const { data: cutoffSettings, error: cutoffErr } = await admin
    .from('settings')
    .select('key, value')
    .in('key', ['preorder_cutoff_time', 'preorder_same_day_cutoff_time'])
  if (cutoffErr) console.error('preorders/public/cancel: failed to load cutoff settings, falling back to 20:00', cutoffErr)
  const settingMap: Record<string, string> = {}
  ;(cutoffSettings || []).forEach((s: any) => { settingMap[s.key] = String(s.value ?? '').replace(/"/g, '') })
  const cutoffTime = settingMap['preorder_cutoff_time'] || '20:00'
  // Same-day orders close at their own deadline — without this a same-day
  // order would be permanently uncancellable by the old evening-before rule.
  const sameDayCutoffTime = settingMap['preorder_same_day_cutoff_time'] || undefined
  if (!isBeforeCutoff(preorder.for_date, cutoffTime, new Date(), undefined, sameDayCutoffTime)) {
    return NextResponse.json({ error: 'Ordering for this date has closed — contact the canteen to cancel.' }, { status: 400 })
  }

  await admin.from('preorders').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: 'Cancelled by customer' }).eq('id', preorderId)
  return NextResponse.json({ ok: true })
}
