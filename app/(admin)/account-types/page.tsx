'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, X, Pencil, Trash2, Lock, Percent, Tag as TagIcon,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { AccountType, Category } from '@/types/database'
import TableSkeleton from '@/components/admin/TableSkeleton'

type DiscountType = 'none' | 'percentage' | 'cost_price' | 'fixed'

const DISCOUNT_TYPES: { value: DiscountType; label: string; description: string }[] = [
  { value: 'none', label: 'No discount', description: 'Pays the regular menu price on everything.' },
  { value: 'percentage', label: 'Percentage off', description: 'Gets a % off the regular price of every item. E.g. 20% off means a $1.00 item costs $0.80.' },
  { value: 'cost_price', label: 'At cost', description: 'Pays what the canteen paid for the item (no markup). If an item has no cost price set, the fallback % off is used instead.' },
  { value: 'fixed', label: 'Fixed amount off', description: 'A set dollar amount is taken off the order total. E.g. $1.00 off every order.' },
]

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b',
]

function discountBadge(t: AccountType) {
  switch (t.discount_type) {
    case 'percentage':
      return { label: `${t.discount_value}% off`, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    case 'cost_price':
      return { label: `At cost${t.discount_value ? ` (${t.discount_value}% fallback)` : ''}`, cls: 'bg-blue-50 text-blue-700 border-blue-200' }
    case 'fixed':
      return { label: `${formatCurrency(t.discount_value)} off`, cls: 'bg-violet-50 text-violet-700 border-violet-200' }
    default:
      return { label: 'No discount', cls: 'bg-slate-50 text-slate-500 border-slate-200' }
  }
}

export default function AccountTypesPage() {
  const supabase = createClient()
  const [types, setTypes] = useState<AccountType[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editType, setEditType] = useState<AccountType | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [tRes, cRes] = await Promise.all([
      supabase.from('account_types').select('*').order('created_at'),
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
    ])
    if (tRes.error) toast.error(tRes.error.message)
    setTypes(tRes.data || [])
    setCategories(cRes.data || [])
    setLoading(false)
  }

  async function toggleActive(t: AccountType) {
    const { error } = await supabase.from('account_types').update({ is_active: !t.is_active }).eq('id', t.id)
    if (error) { toast.error(error.message); return }
    setTypes(prev => prev.map(x => x.id === t.id ? { ...x, is_active: !t.is_active } : x))
    toast.success(`${t.name} ${t.is_active ? 'deactivated' : 'activated'}`)
  }

  async function deleteType(t: AccountType) {
    if (t.is_system) return
    if (!confirm(`Delete the "${t.name}" account type? This cannot be undone. Bochurim using it will need to be reassigned.`)) return
    const { error } = await supabase.from('account_types').delete().eq('id', t.id)
    if (error) {
      toast.error(error.message.includes('violates foreign key')
        ? 'Cannot delete — bochurim are still assigned to this type. Reassign them first.'
        : error.message)
      return
    }
    toast.success('Account type deleted')
    loadData()
  }

  const catName = (id: string) => categories.find(c => c.id === id)?.name || 'Unknown'

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Account Types</h1>
          <p className="text-slate-500 text-sm mt-1">
            Control what discount each group of bochurim gets at the register
          </p>
        </div>
        <button onClick={() => { setEditType(null); setShowForm(true) }} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Add Account Type
        </button>
      </div>

      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Discount</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Exclusions</th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Active</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={5} />
              ) : types.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-400 text-sm">No account types yet</td></tr>
              ) : types.map(t => {
                const badge = discountBadge(t)
                const exclusions = t.exclusion_category_ids || []
                return (
                  <tr key={t.id} className="table-row">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/10"
                          style={{ backgroundColor: t.color || '#94a3b8' }}
                        />
                        <span className="text-sm font-semibold text-slate-900">{t.name}</span>
                        {t.is_system && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-medium border border-slate-200">
                            <Lock className="w-3 h-3" /> System
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {exclusions.length === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-1" title={exclusions.map(catName).join(', ')}>
                          <TagIcon className="w-3.5 h-3.5 text-slate-400" />
                          {exclusions.length} categor{exclusions.length === 1 ? 'y' : 'ies'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleActive(t)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${t.is_active ? 'bg-amber-500' : 'bg-slate-200'}`}
                        aria-label={t.is_active ? 'Deactivate' : 'Activate'}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${t.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => { setEditType(t); setShowForm(true) }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                          aria-label="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {!t.is_system && (
                          <button
                            onClick={() => deleteType(t)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            aria-label="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
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
      </div>

      {showForm && (
        <AccountTypeFormModal
          accountType={editType}
          categories={categories}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadData() }}
        />
      )}
    </div>
  )
}

// ─── Create / Edit modal ──────────────────────────────────────────────────────

function AccountTypeFormModal({ accountType, categories, onClose, onSaved }: {
  accountType: AccountType | null
  categories: Category[]
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const isEdit = !!accountType

  const [name, setName] = useState(accountType?.name || '')
  const [color, setColor] = useState(accountType?.color || PRESET_COLORS[6])
  const [discountType, setDiscountType] = useState<DiscountType>(accountType?.discount_type || 'none')
  const [discountValue, setDiscountValue] = useState(
    accountType && accountType.discount_value ? String(accountType.discount_value) : ''
  )
  const [excludedIds, setExcludedIds] = useState<Set<string>>(
    new Set(accountType?.exclusion_category_ids || [])
  )
  const [exclusionType, setExclusionType] = useState<DiscountType>(accountType?.exclusion_discount_type || 'none')
  const [exclusionValue, setExclusionValue] = useState(
    accountType?.exclusion_discount_value != null && accountType.exclusion_discount_value !== 0
      ? String(accountType.exclusion_discount_value) : ''
  )
  const [isActive, setIsActive] = useState(accountType?.is_active ?? true)
  const [saving, setSaving] = useState(false)

  const hasExclusions = excludedIds.size > 0
  const needsValue = discountType === 'percentage' || discountType === 'cost_price' || discountType === 'fixed'
  const exclusionNeedsValue = exclusionType === 'percentage' || exclusionType === 'cost_price' || exclusionType === 'fixed'

  function toggleCategory(id: string) {
    setExcludedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function save() {
    if (!name.trim()) { toast.error('Name is required'); return }
    const parsedValue = parseFloat(discountValue)
    if (discountType === 'percentage' || discountType === 'fixed') {
      if (isNaN(parsedValue) || parsedValue <= 0) {
        toast.error(discountType === 'percentage' ? 'Enter a percentage greater than 0' : 'Enter a dollar amount greater than 0')
        return
      }
      if (discountType === 'percentage' && parsedValue > 100) { toast.error('Percentage cannot exceed 100'); return }
    }
    if (discountType === 'cost_price' && discountValue && (isNaN(parsedValue) || parsedValue < 0 || parsedValue > 100)) {
      toast.error('Fallback percentage must be between 0 and 100'); return
    }
    const parsedExclusionValue = parseFloat(exclusionValue)
    if (hasExclusions && exclusionNeedsValue) {
      if (exclusionType === 'percentage' || exclusionType === 'fixed') {
        if (isNaN(parsedExclusionValue) || parsedExclusionValue <= 0) {
          toast.error('Enter a value for the excluded-category discount'); return
        }
        if (exclusionType === 'percentage' && parsedExclusionValue > 100) { toast.error('Exclusion percentage cannot exceed 100'); return }
      }
      if (exclusionType === 'cost_price' && exclusionValue && (isNaN(parsedExclusionValue) || parsedExclusionValue < 0 || parsedExclusionValue > 100)) {
        toast.error('Exclusion fallback percentage must be between 0 and 100'); return
      }
    }

    setSaving(true)
    const payload = {
      name: name.trim(),
      color,
      discount_type: discountType,
      discount_value: discountType === 'none' ? 0 : (isNaN(parsedValue) ? 0 : parsedValue),
      exclusion_category_ids: Array.from(excludedIds),
      exclusion_discount_type: hasExclusions ? exclusionType : null,
      exclusion_discount_value: hasExclusions && exclusionNeedsValue && !isNaN(parsedExclusionValue)
        ? parsedExclusionValue : hasExclusions ? 0 : null,
      is_active: isActive,
    }

    const { error } = isEdit
      ? await supabase.from('account_types').update(payload).eq('id', accountType!.id)
      : await supabase.from('account_types').insert(payload)

    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success(isEdit ? 'Account type updated' : 'Account type created')
    onSaved()
  }

  const validHex = /^#[0-9a-fA-F]{6}$/.test(color)

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-slate-900 text-lg">
              {isEdit ? `Edit ${accountType!.name}` : 'New Account Type'}
            </h2>
            {accountType?.is_system && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-medium border border-slate-200">
                <Lock className="w-3 h-3" /> System
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-5 overflow-y-auto flex-1">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Yeshiva Bochur, Staff, Guest"
              className="input-admin"
              autoFocus={!isEdit}
            />
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Color</label>
            <p className="text-xs text-slate-400">Used as a tag so cashiers can spot the account type at a glance.</p>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? 'border-slate-800 scale-110' : 'border-transparent hover:scale-105'}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
              <div className="flex items-center gap-1.5 ml-1">
                <span
                  className="w-8 h-8 rounded-full border border-slate-200 shrink-0"
                  style={{ backgroundColor: validHex ? color : '#ffffff' }}
                />
                <input
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  placeholder="#3b82f6"
                  className="input-admin w-28 font-mono text-sm"
                  maxLength={7}
                />
              </div>
            </div>
            {!validHex && color !== '' && (
              <p className="text-xs text-red-500">Enter a hex color like #3b82f6</p>
            )}
          </div>

          {/* Discount type */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Discount</label>
            <p className="text-xs text-slate-400">What happens to prices when a bochur with this account type buys something.</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {DISCOUNT_TYPES.map(dt => (
                <button
                  key={dt.value}
                  type="button"
                  onClick={() => setDiscountType(dt.value)}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${
                    discountType === dt.value
                      ? 'border-amber-400 bg-amber-50/60'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-800">{dt.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-snug">{dt.description}</p>
                </button>
              ))}
            </div>

            {needsValue && (
              <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                {discountType === 'percentage' && (
                  <ValueInput
                    label="Percent off"
                    suffix="%"
                    value={discountValue}
                    onChange={setDiscountValue}
                    hint="e.g. 20 means everything is 20% cheaper"
                  />
                )}
                {discountType === 'cost_price' && (
                  <ValueInput
                    label="Fallback percent off"
                    suffix="%"
                    value={discountValue}
                    onChange={setDiscountValue}
                    hint="Used only for items that have no cost price set. Leave blank for no fallback discount."
                  />
                )}
                {discountType === 'fixed' && (
                  <ValueInput
                    label="Amount off each order"
                    prefix="$"
                    value={discountValue}
                    onChange={setDiscountValue}
                    hint="e.g. 1.00 takes a dollar off the total"
                  />
                )}
              </div>
            )}
          </div>

          {/* Exclusion categories */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Excluded categories</label>
            <p className="text-xs text-slate-400">
              Items in these categories do NOT get the discount above. You can give them a different discount (or none) instead.
            </p>
            {categories.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No categories found</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {categories.map(c => {
                  const selected = excludedIds.has(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCategory(c.id)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                        selected
                          ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {c.name}
                    </button>
                  )
                })}
              </div>
            )}

            {hasExclusions && (
              <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <p className="text-xs font-semibold text-slate-600">
                  Discount for the {excludedIds.size} excluded categor{excludedIds.size === 1 ? 'y' : 'ies'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {DISCOUNT_TYPES.map(dt => (
                    <button
                      key={dt.value}
                      type="button"
                      onClick={() => setExclusionType(dt.value)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                        exclusionType === dt.value
                          ? 'bg-slate-800 border-slate-800 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {dt.label}
                    </button>
                  ))}
                </div>
                {exclusionNeedsValue && (
                  <ValueInput
                    label={
                      exclusionType === 'percentage' ? 'Percent off excluded items'
                        : exclusionType === 'cost_price' ? 'Fallback percent off (excluded items)'
                          : 'Amount off (excluded items)'
                    }
                    prefix={exclusionType === 'fixed' ? '$' : undefined}
                    suffix={exclusionType !== 'fixed' ? '%' : undefined}
                    value={exclusionValue}
                    onChange={setExclusionValue}
                  />
                )}
              </div>
            )}
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <div>
              <p className="text-sm font-semibold text-slate-700">Active</p>
              <p className="text-xs text-slate-400">Inactive types can't be assigned to bochurim.</p>
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
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Account Type'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ValueInput({ label, value, onChange, prefix, suffix, hint }: {
  label: string
  value: string
  onChange: (v: string) => void
  prefix?: string
  suffix?: string
  hint?: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      <div className="flex items-center gap-1.5">
        {prefix && <span className="text-sm font-semibold text-slate-500">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={prefix === '$' ? 0.25 : 1}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="input-admin w-32 text-right"
          placeholder="0"
        />
        {suffix && <span className="text-sm font-semibold text-slate-500">{suffix}</span>}
      </div>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
}
