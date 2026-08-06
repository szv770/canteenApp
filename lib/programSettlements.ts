import type { SupabaseClient } from '@supabase/supabase-js'

export interface SettlementBalanceRow {
  bochurId: string
  name: string
  bochurDisplayId: string | null
  phone: string | null
  balance: number // positive = owed to family, negative = owed to canteen
  pending: {
    id: string
    direction: 'refund' | 'collection' | 'write_off'
    amount: number
    method: 'cash' | 'zelle' | 'write_off'
    note: string | null
  } | null
}

export interface ZelleQueueRow {
  settlementId: string
  bochurId: string
  name: string
  phone: string | null
  direction: 'refund' | 'collection'
  amount: number
  note: string | null
}

// Every student with a non-zero balance right now, split into the two lists —
// includes archived students (a leftover balance at program end still needs
// settling even if the account itself is archived). Each row carries its
// pending settlement (if one has been queued but not yet confirmed) so the
// UI can show "Pending: $X via Zelle" instead of a bare balance.
export async function fetchSettlementBalances(supabase: SupabaseClient): Promise<{
  owedToFamilies: SettlementBalanceRow[]
  owedToCanteen: SettlementBalanceRow[]
}> {
  const [{ data: bochurim }, { data: pendingSettlements }] = await Promise.all([
    supabase.from('bochurim_with_id').select('id, name, bochur_id, phone, balance').neq('balance', 0),
    supabase.from('program_settlements').select('*').eq('status', 'pending'),
  ])

  const pendingByBochur = new Map((pendingSettlements || []).map((s: any) => [s.bochur_id, s]))

  const rows: SettlementBalanceRow[] = ((bochurim || []) as any[]).map(b => {
    const pending = pendingByBochur.get(b.id)
    return {
      bochurId: b.id,
      name: b.name,
      bochurDisplayId: b.bochur_id ?? null,
      phone: b.phone ?? null,
      balance: Number(b.balance),
      pending: pending ? {
        id: pending.id,
        direction: pending.direction,
        amount: Number(pending.amount),
        method: pending.method,
        note: pending.note,
      } : null,
    }
  })

  return {
    owedToFamilies: rows.filter(r => r.balance > 0).sort((a, b) => b.balance - a.balance),
    owedToCanteen: rows.filter(r => r.balance < 0).sort((a, b) => a.balance - b.balance),
  }
}

// Every pending settlement with method='zelle', across both directions —
// the manual send/collect worklist, since Zelle has no API integration.
export async function fetchZelleQueue(supabase: SupabaseClient): Promise<ZelleQueueRow[]> {
  const { data: settlements } = await supabase
    .from('program_settlements')
    .select('*')
    .eq('status', 'pending')
    .eq('method', 'zelle')
    .order('created_at', { ascending: true })

  const bochurIds = Array.from(new Set((settlements || []).map((s: any) => s.bochur_id)))
  const { data: bochurim } = bochurIds.length
    ? await supabase.from('bochurim').select('id, name, phone').in('id', bochurIds)
    : { data: [] as any[] }
  const bochurMap = new Map((bochurim || []).map((b: any) => [b.id, b]))

  return ((settlements || []) as any[]).map(s => {
    const b = bochurMap.get(s.bochur_id)
    return {
      settlementId: s.id,
      bochurId: s.bochur_id,
      name: b?.name || 'Student',
      phone: b?.phone ?? null,
      direction: s.direction,
      amount: Number(s.amount),
      note: s.note,
    }
  })
}

// Queues a settlement (no money moves yet) — safe for a direct client insert
// since nothing financial happens until /api/admin/program-settlements/confirm
// is called. Replaces any existing pending settlement for the same student
// (e.g. admin changed their mind about method or amount).
export async function queueSettlement(
  supabase: SupabaseClient,
  params: { bochurId: string; direction: 'refund' | 'collection' | 'write_off'; amount: number; method: 'cash' | 'zelle' | 'write_off'; note?: string | null }
) {
  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('program_settlements').delete().eq('bochur_id', params.bochurId).eq('status', 'pending')
  return supabase.from('program_settlements').insert({
    bochur_id: params.bochurId,
    direction: params.direction,
    amount: params.amount,
    method: params.method,
    note: params.note || null,
    created_by: user?.id ?? null,
  })
}

export async function cancelPendingSettlement(supabase: SupabaseClient, settlementId: string) {
  return supabase.from('program_settlements').delete().eq('id', settlementId).eq('status', 'pending')
}

// Executes a queued settlement — the only step that actually touches balance
// + balance_ledger, via the admin-only API route (atomic status-claim guards
// against double-processing, same pattern as topup-confirm).
export async function confirmSettlement(settlementId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/admin/program-settlements/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settlement_id: settlementId }),
  })
  const json = await res.json()
  if (!res.ok) return { ok: false, error: json.error || 'Failed to confirm settlement' }
  return { ok: true }
}
