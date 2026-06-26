import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const amount = Number(body.amount)
  if (!amount || amount <= 0 || amount > 10000) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
  }

  const validMethods = ['cash', 'zelle', 'credit_card', 'check', 'other']
  const method = typeof body.method === 'string' && validMethods.includes(body.method) ? body.method : 'other'
  const bochur_id = typeof body.bochur_id === 'string' && body.bochur_id !== 'none' ? body.bochur_id : null
  const parent_name = typeof body.parent_name === 'string' ? body.parent_name.slice(0, 100) : null
  const parent_notes = typeof body.parent_notes === 'string' ? body.parent_notes.slice(0, 500) : null

  // If bochur_id provided, verify it exists
  const admin = createAdminClient()
  if (bochur_id) {
    const { data: bochur } = await admin.from('bochurim').select('id').eq('id', bochur_id).single()
    if (!bochur) return NextResponse.json({ error: 'Student not found' }, { status: 400 })
  }

  const { error } = await admin.from('topup_requests').insert({ bochur_id, parent_name, amount, method, parent_notes })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true }, { status: 201 })
}
