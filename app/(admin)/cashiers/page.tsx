'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, Shield, User, Key, Pencil, Trash2, DollarSign, Link, Unlink } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCurrency } from '@/lib/utils'
import type { CashierProfile } from '@/types/database'

interface CashierRow extends CashierProfile {
  tip_balance?: number
  bochur_id?: string | null
  linked_bochur_name?: string | null
}

export default function CashiersPage() {
  const supabase = createClient()
  const [cashiers, setCashiers] = useState<CashierRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<CashierRow | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null))
    loadCashiers()
  }, [])

  async function loadCashiers() {
    setLoading(true)
    const { data } = await supabase
      .from('cashier_profiles')
      .select('*, bochurim:bochur_id(name)')
      .order('name')
    const rows: CashierRow[] = (data || []).map((c: any) => ({
      ...c,
      linked_bochur_name: c.bochurim?.name ?? null,
    }))
    setCashiers(rows)
    setLoading(false)
  }

  async function toggleActive(cashier: CashierRow) {
    const res = await fetch('/api/admin/cashier', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cashier.id, is_active: !cashier.is_active }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(cashier.is_active ? 'Cashier deactivated' : 'Cashier activated')
    loadCashiers()
  }

  async function deleteCashier(cashier: CashierRow) {
    if (!confirm(`Delete ${cashier.name}? This cannot be undone.`)) return
    const res = await fetch('/api/admin/cashier', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cashier.id }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Cashier deleted')
    loadCashiers()
  }

  async function markTipsPaid(cashier: CashierRow) {
    const amount = cashier.tip_balance || 0
    if (!amount) return

    if (cashier.bochur_id) {
      // Cashier has a linked bochur account — transfer to their canteen balance
      if (!confirm(`Transfer ${formatCurrency(amount)} in tips to ${cashier.linked_bochur_name || 'linked student account'}'s canteen balance?`)) return
      const res = await fetch('/api/admin/cashier', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cashier.id, action: 'payout_tips' }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.error === 'no_bochur_linked') {
          toast.error('Link this cashier to a student account first to transfer tips.')
        } else {
          toast.error(json.error || 'Failed to transfer tips')
        }
        return
      }
      toast.success(`${formatCurrency(amount)} transferred to ${cashier.linked_bochur_name || 'student'}'s canteen balance`)
    } else {
      // No linked account — mark as cash payout only
      if (!confirm(
        `No student account is linked for ${cashier.name}.\n\n` +
        `Mark ${formatCurrency(amount)} as paid out in cash (balance will be zeroed)?\n\n` +
        `To transfer to a canteen balance instead, link a student account first via Edit.`
      )) return
      const res = await fetch('/api/admin/cashier', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cashier.id, tip_balance: 0 }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error); return }
      toast.success(`Marked ${formatCurrency(amount)} tips as paid out (cash)`)
    }
    loadCashiers()
  }

  const hasTips = cashiers.some(c => (c.tip_balance || 0) > 0)

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Cashiers</h1>
          <p className="text-gray-500 text-sm mt-1">Manage staff accounts and permissions</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Add Cashier
        </button>
      </div>

      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Name</th>
                <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Role</th>
                <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Linked Account</th>
                {hasTips && <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Tips Owed</th>}
                <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Status</th>
                <th className="text-right text-xs font-medium text-gray-400 px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={hasTips ? 6 : 5} className="px-5 py-12 text-center text-gray-400">Loading...</td></tr>
              ) : cashiers.length === 0 ? (
                <tr><td colSpan={hasTips ? 6 : 5} className="px-5 py-12 text-center text-gray-400">No cashiers yet</td></tr>
              ) : cashiers.map(c => (
                <tr key={c.id} className="table-row">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${c.role === 'admin' ? 'bg-brand' : 'bg-slate-400'}`}>
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{c.name}</p>
                        {c.id === currentUserId && <p className="text-xs text-brand font-medium">You</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`badge ${c.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                      {c.role === 'admin' ? <Shield className="w-3 h-3 inline mr-1" /> : <User className="w-3 h-3 inline mr-1" />}
                      {c.role === 'admin' ? 'Admin' : 'Cashier'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {c.linked_bochur_name ? (
                      <span className="badge bg-blue-50 text-blue-700">
                        <Link className="w-3 h-3 inline mr-1" />
                        {c.linked_bochur_name}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Not linked</span>
                    )}
                  </td>
                  {hasTips && (
                    <td className="px-5 py-3">
                      {(c.tip_balance || 0) > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-emerald-700">{formatCurrency(c.tip_balance || 0)}</span>
                          <button
                            onClick={() => markTipsPaid(c)}
                            className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200"
                          >
                            Mark paid
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-5 py-3">
                    <button
                      onClick={() => toggleActive(c)}
                      disabled={c.id === currentUserId}
                      className={`badge cursor-pointer transition-colors ${c.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-600 hover:bg-red-200'} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {c.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditTarget(c)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="Edit">
                        <Pencil className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                      {c.id !== currentUserId && (
                        <button onClick={() => deleteCashier(c)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <CashierModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); loadCashiers() }}
        />
      )}
      {editTarget && (
        <CashierModal
          cashier={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); loadCashiers() }}
        />
      )}
    </div>
  )
}

function CashierModal({
  cashier,
  onClose,
  onSaved,
}: {
  cashier?: CashierRow
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const isEdit = !!cashier
  const [name, setName] = useState(cashier?.name || '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'cashier'>(cashier?.role || 'cashier')
  const [saving, setSaving] = useState(false)

  // Bochur link state
  const [bochurimQuery, setBochurimQuery] = useState('')
  const [bochurimResults, setBochurimResults] = useState<{ id: string; name: string }[]>([])
  const [linkedBochurId, setLinkedBochurId] = useState<string | null>(cashier?.bochur_id ?? null)
  const [linkedBochurName, setLinkedBochurName] = useState<string | null>(cashier?.linked_bochur_name ?? null)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  const searchBochurim = useCallback((q: string) => {
    clearTimeout(searchTimer.current)
    if (!q.trim()) { setBochurimResults([]); return }
    searchTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('bochurim')
        .select('id, name')
        .ilike('name', `%${q.trim()}%`)
        .eq('archived', false)
        .limit(6)
      setBochurimResults(data || [])
    }, 200)
  }, [])

  function selectBochur(b: { id: string; name: string }) {
    setLinkedBochurId(b.id)
    setLinkedBochurName(b.name)
    setBochurimQuery('')
    setBochurimResults([])
  }

  function unlinkBochur() {
    setLinkedBochurId(null)
    setLinkedBochurName(null)
  }

  async function save() {
    if (!name.trim()) { toast.error('Name is required'); return }
    if (!isEdit && (!email.trim() || !password.trim())) {
      toast.error('Email and password are required')
      return
    }

    setSaving(true)
    const res = await fetch('/api/admin/cashier', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        isEdit
          ? { id: cashier!.id, name, role, bochur_id: linkedBochurId, ...(password ? { password } : {}) }
          : { name, email, password, role }
      ),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { toast.error(json.error); return }
    toast.success(isEdit ? 'Cashier updated' : 'Cashier created')
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md animate-scale-in max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 shrink-0">
          <h2 className="font-bold text-gray-900">{isEdit ? 'Edit Cashier' : 'Add Cashier'}</h2>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 rounded-xl">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              className="input-admin"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Full name"
            />
          </div>
          {!isEdit && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  className="input-admin"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="cashier@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input
                  type="password"
                  className="input-admin"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                />
              </div>
            </>
          )}
          {isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Key className="w-3.5 h-3.5 inline mr-1" />
                New Password (leave blank to keep current)
              </label>
              <input
                type="password"
                className="input-admin"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Leave blank to keep current"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <div className="grid grid-cols-2 gap-2">
              {(['cashier', 'admin'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all ${role === r ? 'border-brand bg-brand/5 text-brand-dark' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                >
                  {r === 'admin' ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  {r === 'admin' ? 'Admin' : 'Cashier'}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {role === 'admin' ? 'Full access including admin panel' : 'POS access only — no admin panel'}
            </p>
          </div>

          {isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <DollarSign className="w-3.5 h-3.5 inline mr-1" />
                Linked Bochur Account <span className="text-gray-400 font-normal">(tips credit here)</span>
              </label>
              {linkedBochurName ? (
                <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <Link className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className="text-sm font-medium text-blue-800 flex-1">{linkedBochurName}</span>
                  <button onClick={unlinkBochur} className="p-1 hover:bg-blue-100 rounded-lg" title="Unlink">
                    <Unlink className="w-3.5 h-3.5 text-blue-400" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    className="input-admin"
                    value={bochurimQuery}
                    onChange={e => { setBochurimQuery(e.target.value); searchBochurim(e.target.value) }}
                    placeholder="Search by student name…"
                  />
                  {bochurimResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      {bochurimResults.map(b => (
                        <button
                          key={b.id}
                          onClick={() => selectBochur(b)}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                        >
                          {b.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-1">Tips will be credited to this student's balance. Leave blank to pool in tip balance for cash payout.</p>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Cashier'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
