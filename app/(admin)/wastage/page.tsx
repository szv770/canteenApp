'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, Trash2, AlertTriangle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const REASONS = ['Expired', 'Damaged', 'Dropped', 'Quality Issue', 'Over-stocked', 'Theft', 'Other']

export default function WastagePage() {
  const supabase = createClient()
  const [entries, setEntries] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [entriesRes, productsRes] = await Promise.all([
      supabase
        .from('wastage_log')
        .select('*, cashier_profiles!cashier_id(name)')
        .order('created_at', { ascending: false })
        .limit(300),
      supabase.from('products').select('id, name, icon, cost_price, price, stock_quantity').eq('is_active', true).order('name'),
    ])
    if (entriesRes.error) toast.error(entriesRes.error.message)
    setEntries(entriesRes.data || [])
    setProducts(productsRes.data || [])
    setLoading(false)
  }

  const totalItems = entries.reduce((s, e) => s + e.quantity, 0)
  const totalCostLost = entries.reduce((s, e) => s + (e.unit_cost || 0) * e.quantity, 0)
  const totalRetailLost = entries.reduce((s, e) => s + (e.unit_price || 0) * e.quantity, 0)

  // Summary by product
  const byProduct: Record<string, { name: string; qty: number; costLost: number; retailLost: number }> = {}
  for (const e of entries) {
    if (!byProduct[e.product_name]) byProduct[e.product_name] = { name: e.product_name, qty: 0, costLost: 0, retailLost: 0 }
    byProduct[e.product_name].qty += e.quantity
    byProduct[e.product_name].costLost += (e.unit_cost || 0) * e.quantity
    byProduct[e.product_name].retailLost += (e.unit_price || 0) * e.quantity
  }
  const topWasted = Object.values(byProduct).sort((a, b) => b.qty - a.qty).slice(0, 8)

  // Summary by cashier
  const byCashier: Record<string, { name: string; entries: number; qty: number; costLost: number }> = {}
  for (const e of entries) {
    const name = e.cashier_profiles?.name || 'Unknown'
    if (!byCashier[name]) byCashier[name] = { name, entries: 0, qty: 0, costLost: 0 }
    byCashier[name].entries++
    byCashier[name].qty += e.quantity
    byCashier[name].costLost += (e.unit_cost || 0) * e.quantity
  }
  const cashierStats = Object.values(byCashier).sort((a, b) => b.qty - a.qty)

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Wastage Log</h1>
          <p className="text-slate-500 text-sm mt-1">
            {entries.length} entries · {totalItems} items wasted · {formatCurrency(totalCostLost)} cost · {formatCurrency(totalRetailLost)} retail value lost
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Log Wastage
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Entries', value: entries.length, color: 'text-slate-900' },
          { label: 'Items Wasted', value: totalItems, color: 'text-amber-600' },
          { label: 'Cost Lost', value: formatCurrency(totalCostLost), color: 'text-red-600' },
          { label: 'Retail Lost', value: formatCurrency(totalRetailLost), color: 'text-red-700' },
        ].map(c => (
          <div key={c.label} className="admin-card p-4">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{c.label}</p>
            <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* By product + by cashier */}
      {!loading && entries.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="admin-card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">Most Wasted Products</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase px-4 py-2">Product</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase px-4 py-2">Qty</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase px-4 py-2">Cost Lost</th>
                </tr>
              </thead>
              <tbody>
                {topWasted.map(p => (
                  <tr key={p.name} className="border-t border-slate-50">
                    <td className="px-4 py-2.5 text-sm text-slate-700">{p.name}</td>
                    <td className="px-4 py-2.5 text-sm font-semibold text-amber-600 text-right">{p.qty}</td>
                    <td className="px-4 py-2.5 text-sm font-semibold text-red-500 text-right">{formatCurrency(p.costLost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">By Cashier</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase px-4 py-2">Cashier</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase px-4 py-2">Entries</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase px-4 py-2">Items</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase px-4 py-2">Cost Lost</th>
                </tr>
              </thead>
              <tbody>
                {cashierStats.map(c => (
                  <tr key={c.name} className="border-t border-slate-50">
                    <td className="px-4 py-2.5 text-sm text-slate-700">{c.name}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 text-right">{c.entries}</td>
                    <td className="px-4 py-2.5 text-sm font-semibold text-amber-600 text-right">{c.qty}</td>
                    <td className="px-4 py-2.5 text-sm font-semibold text-red-500 text-right">{formatCurrency(c.costLost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Full log */}
      <div className="admin-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">All Entries</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No wastage logged yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase px-4 py-2">Date</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase px-4 py-2">Product</th>
                  <th className="text-center text-xs font-semibold text-slate-400 uppercase px-4 py-2">Qty</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase px-4 py-2">Reason</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase px-4 py-2">Cashier</th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase px-4 py-2">Cost Lost</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase px-4 py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">{format(new Date(e.created_at), 'MMM d, h:mm a')}</td>
                    <td className="px-4 py-2.5 text-sm font-medium text-slate-800">{e.product_name}</td>
                    <td className="px-4 py-2.5 text-sm font-bold text-amber-600 text-center">{e.quantity}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">{e.reason}</span>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-slate-500">{e.cashier_profiles?.name || '—'}</td>
                    <td className="px-4 py-2.5 text-sm font-semibold text-red-500 text-right">{formatCurrency((e.unit_cost || 0) * e.quantity)}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400 max-w-[200px] truncate">{e.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <AddWastageModal
          products={products}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load() }}
        />
      )}
    </div>
  )
}

function AddWastageModal({ products, onClose, onSaved }: { products: any[]; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<any>(null)
  const [quantity, setQuantity] = useState(1)
  const [reason, setReason] = useState('')
  const [otherReason, setOtherReason] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))

  async function save() {
    if (!selected) { toast.error('Select a product'); return }
    if (!reason) { toast.error('Select a reason'); return }
    if (quantity <= 0) { toast.error('Quantity must be at least 1'); return }
    const finalReason = reason === 'Other' ? (otherReason.trim() || 'Other') : reason
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    const { data: cashierRow } = await supabase.from('cashier_profiles').select('id').eq('id', user?.id).single()

    const { error } = await supabase.from('wastage_log').insert({
      product_id: selected.id,
      product_name: selected.name,
      quantity,
      reason: finalReason,
      unit_cost: selected.cost_price || 0,
      unit_price: selected.price || 0,
      notes: notes.trim() || null,
      cashier_id: cashierRow?.id || null,
    })
    if (error) { toast.error(error.message); setSaving(false); return }

    // Deduct from stock
    if (selected.stock_quantity != null) {
      await supabase.from('products')
        .update({ stock_quantity: Math.max(0, (selected.stock_quantity || 0) - quantity) })
        .eq('id', selected.id)
    }

    toast.success('Wastage logged & stock deducted')
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
          <h2 className="font-bold text-slate-900">Log Wastage</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Product picker */}
          {!selected ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Product</label>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search products..."
                className="input-admin mb-2"
              />
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-48 overflow-y-auto">
                {filtered.slice(0, 10).map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setSelected(p); setSearch('') }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-left text-sm"
                  >
                    {p.icon && <span>{p.icon}</span>}
                    <span className="flex-1">{p.name}</span>
                    <span className="text-slate-400 text-xs">Stock: {p.stock_quantity}</span>
                  </button>
                ))}
                {filtered.length === 0 && <p className="px-3 py-3 text-sm text-slate-400">No products found</p>}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              {selected.icon && <span className="text-xl">{selected.icon}</span>}
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">{selected.name}</p>
                <p className="text-xs text-slate-500">Stock: {selected.stock_quantity} · Cost: {formatCurrency(selected.cost_price || 0)}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 hover:bg-amber-100 rounded-lg">
                <X className="w-4 h-4 text-amber-600" />
              </button>
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Quantity Wasted</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={e => setQuantity(parseInt(e.target.value) || 1)}
              className="input-admin w-24"
            />
          </div>

          {/* Reason chips */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Reason *</label>
            <div className="flex flex-wrap gap-2">
              {REASONS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${reason === r ? 'bg-red-500 text-white border-red-500' : 'bg-white text-slate-600 border-slate-200 hover:border-red-300'}`}
                >
                  {r}
                </button>
              ))}
            </div>
            {reason === 'Other' && (
              <input
                value={otherReason}
                onChange={e => setOtherReason(e.target.value)}
                placeholder="Describe the reason..."
                className="input-admin mt-2"
              />
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional details..."
              className="input-admin resize-none"
            />
          </div>

          {selected && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
              This will deduct {quantity} unit{quantity !== 1 ? 's' : ''} from {selected.name}'s stock
              and record {formatCurrency((selected.cost_price || 0) * quantity)} cost loss.
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={save} disabled={saving || !selected || !reason} className="btn-primary flex-1">
              {saving ? 'Saving...' : 'Log Wastage'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
