'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, Archive, DollarSign, X, Pencil, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { BochurWithId, AccountType } from '@/types/database'
import TableSkeleton from '@/components/admin/TableSkeleton'
import BochurProfileModal from './BochurProfileModal'

export default function BochurimPage() {
  const supabase = createClient()
  const [bochurim, setBochurim] = useState<BochurWithId[]>([])
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([])
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editBochur, setEditBochur] = useState<BochurWithId | null>(null)
  const [topupBochur, setTopupBochur] = useState<BochurWithId | null>(null)
  const [profileBochur, setProfileBochur] = useState<BochurWithId | null>(null)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  useEffect(() => { setPage(0); loadData() }, [showArchived])

  async function loadData() {
    setLoading(true)
    const [bRes, atRes] = await Promise.all([
      supabase.from('bochurim_with_id').select('*, account_type:account_types(*)').eq('archived', showArchived).order('name'),
      supabase.from('account_types').select('*').order('name'),
    ])
    setBochurim(bRes.data || [])
    setAccountTypes(atRes.data || [])
    setLoading(false)
  }

  const filtered = bochurim.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    (b.bochur_id || '').toLowerCase().includes(search.toLowerCase()) ||
    (b.grade || '').toLowerCase().includes(search.toLowerCase())
  )
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  async function archiveBochur(id: string) {
    if (!confirm('Archive this bochur? They will no longer appear in POS searches.')) return
    const { error } = await supabase.from('bochurim').update({ archived: true }).eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Bochur archived')
    loadData()
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Bochurim</h1>
          <p className="text-slate-500 text-sm mt-1">{filtered.length} {showArchived ? 'archived' : 'active'} accounts</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`btn-secondary text-sm ${showArchived ? 'bg-amber-50 border-amber-200 text-amber-700' : ''}`}
          >
            <Archive className="w-4 h-4" />
            {showArchived ? 'Show Active' : 'Archived'}
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> Add Bochur
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          placeholder="Search by name, ID, or grade..."
          className="input-admin pl-9"
        />
      </div>

      {/* Table */}
      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">ID</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Grade</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Account Type</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Balance</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={6} />
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400 text-sm">No bochurim found</td></tr>
              ) : paginated.map(b => (
                <tr
                  key={b.id}
                  className="table-row cursor-pointer"
                  onClick={() => setProfileBochur(b)}
                >
                  <td className="px-5 py-3 text-sm font-mono text-slate-500">{b.bochur_id}</td>
                  <td className="px-5 py-3 text-sm font-semibold text-slate-900">
                    <div className="flex items-center gap-2">
                      {b.name}
                      {b.is_frozen && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-semibold border border-red-200">
                          Frozen
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-500">{b.grade || '—'}</td>
                  <td className="px-5 py-3 text-sm text-slate-500">{(b as any).account_type?.name}</td>
                  <td className={`px-5 py-3 text-sm font-bold text-right ${b.balance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {formatCurrency(b.balance)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={e => { e.stopPropagation(); setTopupBochur(b) }}
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Add funds"
                      >
                        <DollarSign className="w-4 h-4" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setEditBochur(b) }}
                        className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {!showArchived && (
                        <button
                          onClick={e => { e.stopPropagation(); archiveBochur(b.id) }}
                          className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-lg transition-colors"
                          title="Archive"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
            <span className="text-xs text-slate-400">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-600 font-medium px-1">{page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <p className="text-sm text-gray-400">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-secondary text-sm py-1.5 px-3 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </button>
            <span className="text-sm text-gray-500 font-medium">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="btn-secondary text-sm py-1.5 px-3 disabled:opacity-40"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {showAdd && (
        <AddBochurModal
          accountTypes={accountTypes}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); loadData() }}
        />
      )}

      {editBochur && (
        <EditBochurModal
          bochur={editBochur}
          accountTypes={accountTypes}
          onClose={() => setEditBochur(null)}
          onSaved={() => { setEditBochur(null); loadData() }}
        />
      )}

      {topupBochur && (
        <TopupModal
          bochur={topupBochur}
          onClose={() => setTopupBochur(null)}
          onSaved={() => { setTopupBochur(null); loadData() }}
        />
      )}

      {profileBochur && (
        <BochurProfileModal
          bochur={profileBochur}
          accountTypes={accountTypes}
          onClose={() => setProfileBochur(null)}
          onUpdated={() => { setProfileBochur(null); loadData() }}
        />
      )}
    </div>
  )
}

function AddBochurModal({ accountTypes, onClose, onSaved }: {
  accountTypes: AccountType[]
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [form, setForm] = useState({
    name: '', grade: '', phone: '',
    account_type_id: accountTypes[0]?.id || '',
    allow_negative: false, max_negative_balance: 5, notes: '',
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    const { error } = await supabase.from('bochurim').insert(form)
    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success('Bochur added!')
    onSaved()
  }

  return (
    <Modal title="Add Bochur" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
          <input autoFocus className="input-admin" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Moshe Goldberg" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Grade</label>
            <input className="input-admin" value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} placeholder="Aleph" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
            <input className="input-admin" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Optional" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Account Type</label>
          <select className="input-admin" value={form.account_type_id} onChange={e => setForm(f => ({ ...f, account_type_id: e.target.value }))}>
            {accountTypes.map(at => <option key={at.id} value={at.id}>{at.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
          <input type="checkbox" id="neg" checked={form.allow_negative} onChange={e => setForm(f => ({ ...f, allow_negative: e.target.checked }))} className="rounded" />
          <label htmlFor="neg" className="text-sm text-slate-700">Allow negative balance</label>
          {form.allow_negative && (
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-xs text-slate-500">Max -$</span>
              <input type="number" className="input-admin w-20 text-sm" value={form.max_negative_balance} onChange={e => setForm(f => ({ ...f, max_negative_balance: parseFloat(e.target.value) }))} min={0} step={0.5} />
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
          <textarea className="input-admin resize-none" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Add Bochur'}</button>
        </div>
      </div>
    </Modal>
  )
}

function EditBochurModal({ bochur, accountTypes, onClose, onSaved }: {
  bochur: BochurWithId
  accountTypes: AccountType[]
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [form, setForm] = useState({
    name: bochur.name,
    grade: bochur.grade || '',
    phone: bochur.phone || '',
    account_type_id: bochur.account_type_id || accountTypes[0]?.id || '',
    allow_negative: bochur.allow_negative,
    max_negative_balance: bochur.max_negative_balance,
    notes: bochur.notes || '',
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    const { error } = await supabase.from('bochurim').update(form).eq('id', bochur.id)
    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success('Bochur updated!')
    onSaved()
  }

  return (
    <Modal title={`Edit — ${bochur.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
          <input autoFocus className="input-admin" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Grade</label>
            <input className="input-admin" value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} placeholder="Aleph" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
            <input className="input-admin" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Account Type</label>
          <select className="input-admin" value={form.account_type_id} onChange={e => setForm(f => ({ ...f, account_type_id: e.target.value }))}>
            {accountTypes.map(at => <option key={at.id} value={at.id}>{at.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
          <input type="checkbox" id="neg-edit" checked={form.allow_negative} onChange={e => setForm(f => ({ ...f, allow_negative: e.target.checked }))} className="rounded" />
          <label htmlFor="neg-edit" className="text-sm text-slate-700">Allow negative balance</label>
          {form.allow_negative && (
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-xs text-slate-500">Max -$</span>
              <input type="number" className="input-admin w-20 text-sm" value={form.max_negative_balance} onChange={e => setForm(f => ({ ...f, max_negative_balance: parseFloat(e.target.value) }))} min={0} step={0.5} />
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
          <textarea className="input-admin resize-none" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>
    </Modal>
  )
}

function TopupModal({ bochur, onClose, onSaved }: {
  bochur: BochurWithId
  onClose: () => void
  onSaved: () => void
}) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/bochur-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bochur_id: bochur.id, amount: amt, method, note: note || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to add funds')

      toast.success(`Added ${formatCurrency(amt)} to ${bochur.name}'s account`)
      onSaved()
    } catch (err: any) {
      const msg = err?.message || ''
      if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network')) {
        toast.error('Network error — please check your connection and try again', { duration: 5000 })
      } else {
        toast.error(msg || 'Failed to add funds — please try again')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Add Funds — ${bochur.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="p-3 bg-slate-50 rounded-xl flex justify-between">
          <span className="text-sm text-slate-600">Current balance</span>
          <span className={`font-bold ${bochur.balance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(bochur.balance)}</span>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Amount</label>
          <input autoFocus type="number" className="input-admin text-lg" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" min={0} step={0.5} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Method</label>
          <select className="input-admin" value={method} onChange={e => setMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="zelle">Zelle</option>
            <option value="manual">Manual Adjustment</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Note (optional)</label>
          <input className="input-admin" value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note" />
        </div>
        {amount && parseFloat(amount) > 0 && (
          <div className="p-3 bg-emerald-50 rounded-xl flex justify-between">
            <span className="text-sm text-emerald-700">New balance</span>
            <span className="font-bold text-emerald-700">{formatCurrency(bochur.balance + parseFloat(amount))}</span>
          </div>
        )}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-success flex-1">{saving ? 'Adding...' : 'Add Funds'}</button>
        </div>
      </div>
    </Modal>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[95vh] sm:max-h-[90vh] flex flex-col animate-scale-in">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0">
          <h2 className="font-bold text-slate-900 text-lg">{title}</h2>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-4 sm:p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
