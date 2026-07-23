'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Search, Archive, DollarSign, X, Pencil,
  ChevronLeft, ChevronRight, Upload, Download, Trash2, AlertTriangle, CheckSquare,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { BochurWithId, AccountType } from '@/types/database'
import TableSkeleton from '@/components/admin/TableSkeleton'
import BochurProfileModal from '../BochurProfileModal'
import AccountTypesPanel from '../AccountTypesPanel'

type TabKey = 'students' | 'account_types'

export default function BochurimPage() {
  const supabase = createClient()
  const params = useParams<{ tab: string }>()
  const VALID_TABS: TabKey[] = ['students', 'account_types']
  const tab: TabKey = VALID_TABS.includes(params.tab as TabKey) ? (params.tab as TabKey) : 'students'
  const [bochurim, setBochurim] = useState<BochurWithId[]>([])
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([])
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editBochur, setEditBochur] = useState<BochurWithId | null>(null)
  const [topupBochur, setTopupBochur] = useState<BochurWithId | null>(null)
  const [profileBochur, setProfileBochur] = useState<BochurWithId | null>(null)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const hasSelection = selectedIds.size > 0

  useEffect(() => { setPage(0); loadData() }, [showArchived])

  async function loadData() {
    setLoading(true)
    setSelectedIds(new Set())
    const [bRes, atRes] = await Promise.all([
      // No join — views don't reliably expose FK relationships to PostgREST
      // (same class of bug as gotcha #1). Merge account_type client-side instead.
      supabase.from('bochurim_with_id').select('*').eq('archived', showArchived).order('name'),
      supabase.from('account_types').select('*').order('name'),
    ])
    if (bRes.error) toast.error('Failed to load bochurim: ' + bRes.error.message)
    if (atRes.error) toast.error('Failed to load account types: ' + atRes.error.message)
    const atMap = Object.fromEntries((atRes.data || []).map((at: AccountType) => [at.id, at]))
    const merged = (bRes.data || []).map((b: any) => ({ ...b, account_type: atMap[b.account_type_id] || null }))
    setBochurim(merged as BochurWithId[])
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

  const allPageSelected = paginated.length > 0 && paginated.every(b => selectedIds.has(b.id))

  function toggleSelectAll() {
    if (allPageSelected) {
      setSelectedIds(prev => { const next = new Set(prev); paginated.forEach(b => next.delete(b.id)); return next })
    } else {
      setSelectedIds(prev => { const next = new Set(prev); paginated.forEach(b => next.add(b.id)); return next })
    }
  }

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  async function archiveBochur(id: string) {
    if (!confirm('Archive this bochur? They will no longer appear in POS searches.')) return
    const { error } = await supabase.from('bochurim').update({ archived: true }).eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Bochur archived')
    loadData()
  }

  async function bulkArchive() {
    const ids = Array.from(selectedIds)
    if (!confirm(`Archive ${ids.length} bochur${ids.length !== 1 ? 'im' : ''}? They will no longer appear in POS searches.`)) return
    const { error } = await supabase.from('bochurim').update({ archived: true }).in('id', ids)
    if (error) { toast.error(error.message); return }
    toast.success(`${ids.length} bochurim archived`)
    loadData()
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Bochurim</h1>

      {/* Tab switcher */}
      <div className="flex gap-1 mt-4 mb-6 border-b border-slate-200">
        {([
          { key: 'students', label: 'Students' },
          { key: 'account_types', label: 'Account Types' },
        ] as { key: TabKey; label: string }[]).map(t => (
          <Link
            key={t.key}
            href={`/bochurim/${t.key}`}
            className={`px-4 py-2.5 text-sm font-semibold -mb-px border-b-2 transition-colors ${
              tab === t.key
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'account_types' ? (
        <AccountTypesPanel />
      ) : (
      <>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <p className="text-slate-500 text-sm">{filtered.length} {showArchived ? 'archived' : 'active'} accounts</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasSelection ? (
            <>
              <span className="text-sm text-slate-500 font-medium">{selectedIds.size} selected</span>
              <button onClick={() => setSelectedIds(new Set())} className="btn-secondary text-sm">
                <X className="w-4 h-4" /> Clear
              </button>
              <button onClick={bulkArchive} className="btn-secondary text-sm text-red-600 hover:bg-red-50 border-red-200">
                <Archive className="w-4 h-4" /> Archive Selected
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setShowArchived(!showArchived)}
                className={`btn-secondary text-sm ${showArchived ? 'bg-amber-50 border-amber-200 text-amber-700' : ''}`}
              >
                <Archive className="w-4 h-4" />
                {showArchived ? 'Show Active' : 'Archived'}
              </button>
              <button onClick={() => setShowBulkImport(true)} className="btn-secondary text-sm">
                <Upload className="w-4 h-4" /> Import CSV
              </button>
              <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">
                <Plus className="w-4 h-4" /> Add Bochur
              </button>
            </>
          )}
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
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                  />
                </th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">ID</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Grade</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Account Type</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Balance</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={7} />
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400 text-sm">No bochurim found</td></tr>
              ) : paginated.map(b => {
                const isSelected = selectedIds.has(b.id)
                return (
                  <tr
                    key={b.id}
                    className={`table-row cursor-pointer ${isSelected ? 'bg-amber-50/60' : ''}`}
                    onClick={() => setProfileBochur(b)}
                  >
                    <td className="px-4 py-3 w-10" onClick={e => toggleSelect(b.id, e)}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="rounded border-slate-300 text-amber-500 focus:ring-amber-400 pointer-events-none"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-500">{b.bochur_id}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        {b.name}
                        {b.is_frozen && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-semibold border border-red-200">
                            Frozen
                          </span>
                        )}
                        {!!b.banned_until && new Date(b.banned_until) > new Date() && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 text-xs font-semibold border border-orange-200">
                            Banned
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{b.grade || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{(b as any).account_type?.name}</td>
                    <td className={`px-4 py-3 text-sm font-bold text-right ${b.balance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {formatCurrency(b.balance)}
                    </td>
                    <td className="px-4 py-3 text-right">
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
                )
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
            <span className="text-xs text-slate-400">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-600 font-medium px-1">{page + 1} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {showAdd && (
        <AddBochurModal accountTypes={accountTypes} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); loadData() }} />
      )}
      {editBochur && (
        <EditBochurModal bochur={editBochur} accountTypes={accountTypes} onClose={() => setEditBochur(null)} onSaved={() => { setEditBochur(null); loadData() }} />
      )}
      {topupBochur && (
        <TopupModal bochur={topupBochur} onClose={() => setTopupBochur(null)} onSaved={() => { setTopupBochur(null); loadData() }} />
      )}
      {profileBochur && (
        <BochurProfileModal bochur={profileBochur} accountTypes={accountTypes} onClose={() => setProfileBochur(null)} onUpdated={() => { setProfileBochur(null); loadData() }} />
      )}
      {showBulkImport && (
        <BulkImportModal accountTypes={accountTypes} onClose={() => setShowBulkImport(false)} onSaved={() => { setShowBulkImport(false); loadData() }} />
      )}
      </>
      )}
    </div>
  )
}

// ─── Bulk Import ──────────────────────────────────────────────────────────────

interface ImportRow {
  name: string
  grade: string
  phone: string
  account_type: string
  starting_balance: string
  notes: string
  _error?: string
}

function parseCSV(text: string): ImportRow[] {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const row: any = {}
    headers.forEach((h, i) => { row[h] = vals[i] || '' })
    const out: ImportRow = {
      name: row.name || '',
      grade: row.grade || '',
      phone: row.phone || '',
      account_type: row.account_type || '',
      starting_balance: row.starting_balance || '0',
      notes: row.notes || '',
    }
    if (!out.name) out._error = 'Name is required'
    else if (out.starting_balance && isNaN(parseFloat(out.starting_balance))) out._error = 'Invalid balance'
    return out
  })
}

function downloadTemplate() {
  const csv = [
    'name,grade,phone,account_type,starting_balance,notes',
    'Moshe Goldberg,Aleph,555-1234,Standard,50,',
    'Yisroel Cohen,Beis,,Standard,0,Scholarship student',
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'bochurim-import-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function BulkImportModal({ accountTypes, onClose, onSaved }: {
  accountTypes: AccountType[]
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [importing, setImporting] = useState(false)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      setRows(parseCSV(text))
    }
    reader.readAsText(file)
  }

  const validRows = rows?.filter(r => !r._error) || []
  const errorRows = rows?.filter(r => r._error) || []

  async function doImport() {
    if (!validRows.length) return
    setImporting(true)
    const defaultTypeId = accountTypes[0]?.id || ''
    const inserts = validRows.map(r => {
      const matchedType = accountTypes.find(at => at.name.toLowerCase() === r.account_type.toLowerCase())
      return {
        name: r.name,
        grade: r.grade || null,
        phone: r.phone || null,
        account_type_id: matchedType?.id || defaultTypeId,
        balance: parseFloat(r.starting_balance) || 0,
        notes: r.notes || null,
        allow_negative: false,
        max_negative_balance: 5,
        archived: false,
      }
    })
    const { error } = await supabase.from('bochurim').insert(inserts)
    if (error) { toast.error(error.message); setImporting(false); return }
    toast.success(`${inserts.length} bochurim imported!`)
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col animate-scale-in">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="font-bold text-slate-900 text-lg">Import Bochurim</h2>
            <p className="text-slate-400 text-sm">Upload a CSV to add multiple bochurim at once</p>
          </div>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Step 1: Download template + upload */}
          {!rows && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-2">
                <p className="text-sm font-semibold text-blue-800">Step 1 — Download the template</p>
                <p className="text-xs text-blue-600">Fill in your bochurim data, then upload the file below. Columns: <span className="font-mono">name, grade, phone, account_type, starting_balance, notes</span></p>
                <button onClick={downloadTemplate} className="btn-secondary text-sm mt-1">
                  <Download className="w-4 h-4" /> Download Template CSV
                </button>
              </div>

              <div className="p-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl text-center space-y-3">
                <Upload className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-medium text-slate-500">Step 2 — Upload your filled CSV</p>
                <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
                <button onClick={() => fileRef.current?.click()} className="btn-primary text-sm">
                  Choose CSV File
                </button>
              </div>

              <div className="text-xs text-slate-400 space-y-1">
                <p><span className="font-semibold">account_type</span> — must match an existing account type name exactly (e.g. "Standard"). Defaults to first type if blank or unrecognised.</p>
                <p><span className="font-semibold">starting_balance</span> — number, e.g. 50 or 25.50. Defaults to 0 if blank.</p>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {rows && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex gap-3">
                <div className="flex-1 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-center">
                  <p className="text-2xl font-bold text-emerald-700">{validRows.length}</p>
                  <p className="text-xs text-emerald-600">Ready to import</p>
                </div>
                {errorRows.length > 0 && (
                  <div className="flex-1 p-3 bg-red-50 border border-red-100 rounded-xl text-center">
                    <p className="text-2xl font-bold text-red-600">{errorRows.length}</p>
                    <p className="text-xs text-red-500">Rows with errors (will be skipped)</p>
                  </div>
                )}
              </div>

              {/* Preview table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left text-xs font-semibold text-slate-500 px-3 py-2">Name</th>
                        <th className="text-left text-xs font-semibold text-slate-500 px-3 py-2">Grade</th>
                        <th className="text-left text-xs font-semibold text-slate-500 px-3 py-2">Phone</th>
                        <th className="text-left text-xs font-semibold text-slate-500 px-3 py-2">Account Type</th>
                        <th className="text-right text-xs font-semibold text-slate-500 px-3 py-2">Balance</th>
                        <th className="text-left text-xs font-semibold text-slate-500 px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className={`border-b border-slate-100 last:border-0 ${r._error ? 'bg-red-50' : ''}`}>
                          <td className="px-3 py-2 font-medium text-slate-900">{r.name || <span className="text-red-400 italic">missing</span>}</td>
                          <td className="px-3 py-2 text-slate-500">{r.grade || '—'}</td>
                          <td className="px-3 py-2 text-slate-500">{r.phone || '—'}</td>
                          <td className="px-3 py-2 text-slate-500">
                            {r.account_type ? (
                              accountTypes.find(at => at.name.toLowerCase() === r.account_type.toLowerCase())
                                ? r.account_type
                                : <span className="text-amber-600">{r.account_type} → {accountTypes[0]?.name}</span>
                            ) : accountTypes[0]?.name}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(parseFloat(r.starting_balance) || 0)}</td>
                          <td className="px-3 py-2">
                            {r._error
                              ? <span className="flex items-center gap-1 text-red-600 text-xs"><AlertTriangle className="w-3 h-3" />{r._error}</span>
                              : <span className="text-emerald-600 text-xs font-medium">✓ Ready</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <button onClick={() => { setRows(null); if (fileRef.current) fileRef.current.value = '' }} className="text-sm text-slate-400 hover:text-slate-600 underline">
                ← Upload a different file
              </button>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-5 border-t border-slate-100 shrink-0 flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          {rows && validRows.length > 0 && (
            <button
              onClick={doImport}
              disabled={importing}
              className="flex-1 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {importing ? 'Importing...' : `Import ${validRows.length} Bochur${validRows.length !== 1 ? 'im' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Add / Edit / Topup / Modal ───────────────────────────────────────────────

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
      toast.error(err?.message || 'Failed to add funds')
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
