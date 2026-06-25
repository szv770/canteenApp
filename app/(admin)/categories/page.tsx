'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Edit2, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Category } from '@/types/database'

const COLORS = ['#EF4444','#F97316','#F59E0B','#10B981','#06B6D4','#3B82F6','#8B5CF6','#EC4899','#6B7280','#1E293B']

export default function CategoriesPage() {
  const supabase = createClient()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [editCat, setEditCat] = useState<Category | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data } = await supabase.from('categories').select('*').order('sort_order')
    setCategories(data || [])
    setLoading(false)
  }

  async function deleteCat(id: string) {
    if (!confirm('Delete this category?')) return
    await supabase.from('categories').delete().eq('id', id)
    toast.success('Category deleted')
    loadData()
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Categories</h1>
          <p className="text-gray-500 text-sm mt-1">{categories.length} categories</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Add Category
        </button>
      </div>

      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[360px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Category</th>
              <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Color</th>
              <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Status</th>
              <th className="text-right text-xs font-medium text-gray-400 px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-5 py-12 text-center text-gray-400">Loading...</td></tr>
            ) : categories.map(cat => (
              <tr key={cat.id} className="table-row">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: cat.color }} />
                    <span className="text-sm font-medium text-gray-900">{cat.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <span className="text-xs font-mono text-gray-400">{cat.color}</span>
                </td>
                <td className="px-5 py-3">
                  <span className={`badge ${cat.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {cat.is_active ? 'Active' : 'Hidden'}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setEditCat(cat)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteCat(cat.id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {(showAdd || editCat) && (
        <CategoryModal
          category={editCat}
          categories={categories}
          onClose={() => { setShowAdd(false); setEditCat(null) }}
          onSaved={() => { setShowAdd(false); setEditCat(null); loadData() }}
        />
      )}
    </div>
  )
}

function CategoryModal({ category, categories, onClose, onSaved }: {
  category: Category | null; categories: Category[]
  onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [form, setForm] = useState({
    name: category?.name || '',
    color: category?.color || COLORS[5],
    parent_id: category?.parent_id || '',
    is_active: category?.is_active ?? true,
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.name.trim()) { toast.error('Name required'); return }
    setSaving(true)
    const payload = { ...form, parent_id: form.parent_id || null }
    const { error } = category
      ? await supabase.from('categories').update(payload).eq('id', category.id)
      : await supabase.from('categories').insert(payload)
    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success(category ? 'Updated' : 'Category added')
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md animate-scale-in max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 shrink-0">
          <h2 className="font-bold text-gray-900 text-lg">{category ? 'Edit Category' : 'Add Category'}</h2>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 rounded-xl"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input className="input-admin" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-lg transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Parent Category (optional)</label>
            <select className="input-admin" value={form.parent_id} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}>
              <option value="">None (top level)</option>
              {categories.filter(c => c.id !== category?.id).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded" />
            <span className="text-sm text-gray-700">Active (visible in POS)</span>
          </label>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : category ? 'Save' : 'Add'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
