'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, Pencil, Trash2, Clock, CalendarOff } from 'lucide-react'
import toast from 'react-hot-toast'
import type { SederScheduleRow } from '@/types/database'
import { computeNextOccurrenceDates, pruneStaleSkipDates } from '@/lib/pos/seder'
import TableSkeleton from '@/components/admin/TableSkeleton'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function daysLabel(days: number[]) {
  if (days.length === 7) return 'Every day'
  const sorted = [...days].sort()
  // Sun-Thu is the common camp pattern — call it out by name
  if (sorted.length === 5 && sorted.join(',') === '0,1,2,3,4') return 'Sun–Thu'
  return sorted.map(d => DAY_LABELS[d]).join(', ') || '—'
}

function timeLabel(t: string) {
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function dateChipLabel(dateStr: string) {
  // Parse as local, not UTC — a bare "YYYY-MM-DD" parses as UTC midnight otherwise
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function SederSchedulePage() {
  const supabase = createClient()
  const [rows, setRows] = useState<SederScheduleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editRow, setEditRow] = useState<SederScheduleRow | null>(null)
  const [skipCounts, setSkipCounts] = useState<Record<string, string>>({})

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data, error } = await supabase.from('seder_schedule').select('*').order('start_time')
    if (error) { toast.error(error.message); setLoading(false); return }
    const cleaned = (data || []) as SederScheduleRow[]
    setRows(cleaned)
    setLoading(false)

    // Prune stale (past) skip dates in the background so the array doesn't grow forever
    for (const row of cleaned) {
      const pruned = pruneStaleSkipDates(row)
      if (pruned.length !== row.skip_dates.length) {
        supabase.from('seder_schedule').update({ skip_dates: pruned }).eq('id', row.id).then(() => {})
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, skip_dates: pruned } : r))
      }
    }
  }

  async function toggleActive(row: SederScheduleRow) {
    const { error } = await supabase.from('seder_schedule').update({ is_active: !row.is_active }).eq('id', row.id)
    if (error) { toast.error(error.message); return }
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_active: !row.is_active } : r))
  }

  async function deleteRow(row: SederScheduleRow) {
    if (!confirm(`Delete "${row.name}"? This cannot be undone.`)) return
    const { error } = await supabase.from('seder_schedule').delete().eq('id', row.id)
    if (error) { toast.error(error.message); return }
    toast.success('Seder removed')
    loadData()
  }

  async function skipNext(row: SederScheduleRow) {
    const n = parseInt(skipCounts[row.id] || '1', 10)
    if (!Number.isFinite(n) || n < 1) { toast.error('Enter a number of occurrences to skip'); return }
    const newDates = computeNextOccurrenceDates(row, n)
    if (newDates.length === 0) {
      toast.error('No upcoming occurrences found — check the days this seder runs on')
      return
    }
    const merged = Array.from(new Set([...row.skip_dates, ...newDates])).sort()
    const { error } = await supabase.from('seder_schedule').update({ skip_dates: merged }).eq('id', row.id)
    if (error) { toast.error(error.message); return }
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, skip_dates: merged } : r))
    toast.success(`Skipping next ${newDates.length} occurrence${newDates.length > 1 ? 's' : ''} of ${row.name}`)
  }

  async function cancelSkip(row: SederScheduleRow, dateStr: string) {
    const next = row.skip_dates.filter(d => d !== dateStr)
    const { error } = await supabase.from('seder_schedule').update({ skip_dates: next }).eq('id', row.id)
    if (error) { toast.error(error.message); return }
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, skip_dates: next } : r))
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Seder Schedule</h1>
          <p className="text-slate-500 text-sm mt-1">
            The POS warns cashiers before each seder and blocks checkout during it
          </p>
        </div>
        <button onClick={() => { setEditRow(null); setShowForm(true) }} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Add Seder
        </button>
      </div>

      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Seder</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Days</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Time</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Reminder</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Skip Upcoming</th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Active</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={7} />
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400 text-sm">No sedorim set up yet</td></tr>
              ) : rows.map(row => {
                const pendingSkips = row.skip_dates
                return (
                  <tr key={row.id} className="table-row align-top">
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-slate-900">{row.name}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{daysLabel(row.days_of_week)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {timeLabel(row.start_time)} – {timeLabel(row.end_time)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {row.reminder_minutes_before} min before
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={skipCounts[row.id] ?? '1'}
                          onChange={e => setSkipCounts(prev => ({ ...prev, [row.id]: e.target.value }))}
                          className="input-admin w-16 text-center py-1.5"
                        />
                        <button
                          onClick={() => skipNext(row)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <CalendarOff className="w-3.5 h-3.5" /> Skip next
                        </button>
                      </div>
                      {pendingSkips.length > 0 && (
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {pendingSkips.map(d => (
                            <span key={d} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600">
                              {dateChipLabel(d)}
                              <button onClick={() => cancelSkip(row, d)} className="hover:text-red-600" aria-label="Cancel skip">
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleActive(row)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${row.is_active ? 'bg-amber-500' : 'bg-slate-200'}`}
                        aria-label={row.is_active ? 'Deactivate' : 'Activate'}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${row.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => { setEditRow(row); setShowForm(true) }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                          aria-label="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteRow(row)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          aria-label="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <SederFormModal
          row={editRow}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadData() }}
        />
      )}
    </div>
  )
}

// ─── Create / Edit modal ──────────────────────────────────────────────────────

function SederFormModal({ row, onClose, onSaved }: {
  row: SederScheduleRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const isEdit = !!row

  const [name, setName] = useState(row?.name || '')
  const [days, setDays] = useState<number[]>(row?.days_of_week ?? [0, 1, 2, 3, 4])
  const [startTime, setStartTime] = useState(row?.start_time?.slice(0, 5) || '13:15')
  const [endTime, setEndTime] = useState(row?.end_time?.slice(0, 5) || '14:30')
  const [reminderMinutes, setReminderMinutes] = useState(String(row?.reminder_minutes_before ?? 20))
  const [isActive, setIsActive] = useState(row?.is_active ?? true)
  const [saving, setSaving] = useState(false)

  function toggleDay(d: number) {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  async function save() {
    if (!name.trim()) { toast.error('Name is required'); return }
    if (days.length === 0) { toast.error('Select at least one day'); return }
    if (!startTime || !endTime) { toast.error('Start and end times are required'); return }
    if (endTime <= startTime) { toast.error('End time must be after start time'); return }
    const minutes = parseInt(reminderMinutes, 10)
    if (!Number.isFinite(minutes) || minutes < 1) { toast.error('Reminder minutes must be a positive number'); return }

    setSaving(true)
    const payload = {
      name: name.trim(),
      days_of_week: days,
      start_time: startTime,
      end_time: endTime,
      reminder_minutes_before: minutes,
      is_active: isActive,
    }

    const { error } = isEdit
      ? await supabase.from('seder_schedule').update(payload).eq('id', row!.id)
      : await supabase.from('seder_schedule').insert({ ...payload, skip_dates: [] })

    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success(isEdit ? 'Seder updated' : 'Seder added')
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[95vh] sm:max-h-[90vh] flex flex-col animate-scale-in">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0">
          <h2 className="font-bold text-slate-900 text-lg">{isEdit ? `Edit ${row!.name}` : 'New Seder'}</h2>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-5 overflow-y-auto flex-1">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Seder Alef"
              className="input-admin"
              autoFocus={!isEdit}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Days</label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_LABELS.map((label, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleDay(idx)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    days.includes(idx)
                      ? 'bg-amber-400 text-white border-amber-400'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Start time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="input-admin" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">End time</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="input-admin" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" /> Reminder (minutes before)
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              value={reminderMinutes}
              onChange={e => setReminderMinutes(e.target.value)}
              className="input-admin w-24"
            />
            <p className="text-xs text-slate-400">Typically 15–25 minutes — gives the cashier time to start wrapping up.</p>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <div>
              <p className="text-sm font-semibold text-slate-700">Active</p>
              <p className="text-xs text-slate-400">Inactive sedorim don't show reminders or block checkout.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${isActive ? 'bg-amber-500' : 'bg-slate-200'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm ${isActive ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-4 sm:p-5 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary text-sm">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Seder'}
          </button>
        </div>
      </div>
    </div>
  )
}
