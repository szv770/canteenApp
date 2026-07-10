'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, Pencil, Trash2, Percent } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { DiscountCode } from '@/types/database'
import TableSkeleton from '@/components/admin/TableSkeleton'

function valueLabel(dc: DiscountCode) {
  return dc.type === 'percent' ? `${dc.value}% off` : `${formatCurrency(dc.value)} off`
}

function usesLabel(dc: DiscountCode) {
  return dc.max_uses == null ? `${dc.uses_count} / ∞` : `${dc.uses_count} / ${dc.max_uses}`
}

function expiresLabel(dc: DiscountCode) {
  if (!dc.expires_at) return 'Never'
  const d = new Date(dc.expires_at)
  const expired = d <= new Date()
  const text = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return expired ? `${text} (expired)` : text
}

export default function DiscountCodesPage() {
  const supabase = createClient()
  const [codes, setCodes] = useState<DiscountCode[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editCode, setEditCode] = useState<DiscountCode | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data, error } = await supabase.from('discount_codes').select('*').order('created_at', { ascending: false })
    if (error) toast.error(error.message)
    setCodes(data || [])
    setLoading(false)
  }

  async function toggleActive(dc: DiscountCode) {
    const { error } = await supabase.from('discount_codes').update({ is_active: !dc.is_active }).eq('id', dc.id)
    if (error) { toast.error(error.message); return }
    setCodes(prev => prev.map(x => x.id === dc.id ? { ...x, is_active: !dc.is_active } : x))
    toast.success(`${dc.code} ${dc.is_active ? 'deactivated' : 'activated'}`)
  }

  async function deleteCode(dc: DiscountCode) {
    if (dc.uses_count > 0) return
    if (!confirm(`Delete the code "${dc.code}"? This cannot be undone.`)) return
    const { error } = await supabase.from('discount_codes').delete().eq('id', dc.id)
    if (error) { toast.error(error.message); return }
    toast.success('Discount code deleted')
    loadData()
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Discount Codes</h1>
          <p className="text-slate-500 text-sm mt-1">
            Create coupon codes cashiers and parents can apply at checkout
          </p>
        </div>
        <button onClick={() => { setEditCode(null); setShowForm(true) }} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Add Discount Code
        </button>
      </div>

      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Code</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Discount</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Min Order</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Uses</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Expires</th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Active</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={7} />
              ) : codes.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400 text-sm">No discount codes yet</td></tr>
              ) : codes.map(dc => (
                <tr key={dc.id} className="table-row">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-mono font-semibold text-slate-900 tracking-wide">{dc.code}</span>
                      {dc.description && <span className="text-xs text-slate-400">{dc.description}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                      dc.type === 'percent'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-violet-50 text-violet-700 border-violet-200'
                    }`}>
                      {valueLabel(dc)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {dc.min_order_amount > 0 ? formatCurrency(dc.min_order_amount) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{usesLabel(dc)}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{expiresLabel(dc)}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleActive(dc)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${dc.is_active ? 'bg-amber-500' : 'bg-slate-200'}`}
                      aria-label={dc.is_active ? 'Deactivate' : 'Activate'}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${dc.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => { setEditCode(dc); setShowForm(true) }}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        aria-label="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {dc.uses_count === 0 && (
                        <button
                          onClick={() => deleteCode(dc)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          aria-label="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {showForm && (
        <DiscountCodeFormModal
          discountCode={editCode}
          existingCodes={codes}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadData() }}
        />
      )}
    </div>
  )
}

// ─── Create / Edit modal ──────────────────────────────────────────────────────

function DiscountCodeFormModal({ discountCode, existingCodes, onClose, onSaved }: {
  discountCode: DiscountCode | null
  existingCodes: DiscountCode[]
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const isEdit = !!discountCode

  const [code, setCode] = useState(discountCode?.code || '')
  const [description, setDescription] = useState(discountCode?.description || '')
  const [type, setType] = useState<'percent' | 'fixed'>(discountCode?.type || 'percent')
  const [value, setValue] = useState(discountCode ? String(discountCode.value) : '')
  const [minOrderAmount, setMinOrderAmount] = useState(
    discountCode?.min_order_amount ? String(discountCode.min_order_amount) : ''
  )
  const [maxUses, setMaxUses] = useState(
    discountCode?.max_uses != null ? String(discountCode.max_uses) : ''
  )
  const [expiresAt, setExpiresAt] = useState(
    discountCode?.expires_at ? discountCode.expires_at.slice(0, 16) : ''
  )
  const [isActive, setIsActive] = useState(discountCode?.is_active ?? true)
  const [saving, setSaving] = useState(false)

  async function save() {
    const trimmedCode = code.trim().toUpperCase()
    if (!trimmedCode) { toast.error('Code is required'); return }

    const parsedValue = parseFloat(value)
    if (isNaN(parsedValue) || parsedValue <= 0) { toast.error('Enter a value greater than 0'); return }
    if (type === 'percent' && parsedValue > 100) {
      if (!confirm(`${parsedValue}% is more than 100% off. Are you sure that's correct?`)) return
    }

    const parsedMinOrder = minOrderAmount.trim() === '' ? 0 : parseFloat(minOrderAmount)
    if (isNaN(parsedMinOrder) || parsedMinOrder < 0) { toast.error('Minimum order amount cannot be negative'); return }

    let parsedMaxUses: number | null = null
    if (maxUses.trim() !== '') {
      parsedMaxUses = parseInt(maxUses, 10)
      if (isNaN(parsedMaxUses) || parsedMaxUses <= 0) { toast.error('Max uses must be a positive number, or leave blank for unlimited'); return }
    }

    setSaving(true)

    // Duplicate check (case-insensitive), excluding self when editing
    const dupe = existingCodes.find(
      c => c.code.toLowerCase() === trimmedCode.toLowerCase() && c.id !== discountCode?.id
    )
    if (dupe) {
      toast.error(`A code "${dupe.code}" already exists`)
      setSaving(false)
      return
    }

    const payload = {
      code: trimmedCode,
      description: description.trim() || null,
      type,
      value: parsedValue,
      min_order_amount: parsedMinOrder,
      max_uses: parsedMaxUses,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      is_active: isActive,
    }

    const { error } = isEdit
      ? await supabase.from('discount_codes').update(payload).eq('id', discountCode!.id)
      : await supabase.from('discount_codes').insert({ ...payload, uses_count: 0 })

    if (error) {
      toast.error(
        error.message.includes('duplicate key') || error.message.includes('unique')
          ? `A code "${trimmedCode}" already exists`
          : error.message
      )
      setSaving(false)
      return
    }

    toast.success(isEdit ? 'Discount code updated' : 'Discount code created')
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[95vh] sm:max-h-[90vh] flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0">
          <h2 className="font-bold text-slate-900 text-lg">
            {isEdit ? `Edit ${discountCode!.code}` : 'New Discount Code'}
          </h2>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-5 overflow-y-auto flex-1">
          {/* Code */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Code</label>
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. SUMMER10"
              className="input-admin font-mono tracking-wide"
              autoFocus={!isEdit}
              maxLength={40}
            />
            <p className="text-xs text-slate-400">Codes are matched case-insensitively at checkout.</p>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Description <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Summer camp welcome discount"
              className="input-admin"
            />
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('percent')}
                className={`text-left p-3 rounded-xl border-2 transition-all ${
                  type === 'percent' ? 'border-amber-400 bg-amber-50/60' : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <p className="text-sm font-semibold text-slate-800">Percent off</p>
                <p className="text-xs text-slate-500 mt-0.5">e.g. 10% off the order</p>
              </button>
              <button
                type="button"
                onClick={() => setType('fixed')}
                className={`text-left p-3 rounded-xl border-2 transition-all ${
                  type === 'fixed' ? 'border-amber-400 bg-amber-50/60' : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <p className="text-sm font-semibold text-slate-800">Fixed amount off</p>
                <p className="text-xs text-slate-500 mt-0.5">e.g. $2.00 off the order</p>
              </button>
            </div>
          </div>

          {/* Value */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">
              {type === 'percent' ? 'Percent off' : 'Amount off'}
            </label>
            <div className="flex items-center gap-1.5">
              {type === 'fixed' && <span className="text-sm font-semibold text-slate-500">$</span>}
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={type === 'percent' ? 1 : 0.25}
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="0"
                className="input-admin w-32"
              />
              {type === 'percent' && <span className="text-sm font-semibold text-slate-500">%</span>}
            </div>
            {type === 'percent' && parseFloat(value) > 100 && (
              <p className="text-xs text-amber-600">That's more than 100% off — double check this is intentional.</p>
            )}
          </div>

          {/* Min order amount */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Minimum order amount <span className="text-slate-400 font-normal">(optional)</span></label>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-slate-500">$</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.25}
                value={minOrderAmount}
                onChange={e => setMinOrderAmount(e.target.value)}
                placeholder="0"
                className="input-admin w-32"
              />
            </div>
            <p className="text-xs text-slate-400">Order subtotal must meet this amount for the code to apply. Leave blank for no minimum.</p>
          </div>

          {/* Max uses */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Max uses <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={maxUses}
              onChange={e => setMaxUses(e.target.value)}
              placeholder="Unlimited"
              className="input-admin w-32"
            />
            <p className="text-xs text-slate-400">Leave blank for unlimited uses.</p>
          </div>

          {/* Expires at */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Expires <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="datetime-local"
              className="input-admin"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
            />
            <p className="text-xs text-slate-400">Leave blank for a code that never expires.</p>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <div>
              <p className="text-sm font-semibold text-slate-700">Active</p>
              <p className="text-xs text-slate-400">Inactive codes are rejected at checkout.</p>
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

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 sm:p-5 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary text-sm">
            <Percent className="w-4 h-4" />
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Discount Code'}
          </button>
        </div>
      </div>
    </div>
  )
}
