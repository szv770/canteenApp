'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Plus, AlertTriangle, DollarSign, Trash2, ShoppingCart, Pencil, X } from 'lucide-react'
import toast from 'react-hot-toast'

interface WastageEntry {
  id: string
  product_id: string | null
  product_name: string
  quantity: number
  reason: string
  unit_cost: number
  unit_price: number
  notes: string | null
  cashier_id: string | null
  created_at: string
  cashier_profiles?: { name: string } | null
}

interface StockEntry {
  id: string
  product_id: string | null
  quantity_added: number
  cost_per_unit: number | null
  notes: string | null
  created_at: string
  products?: { name: string } | null
}

interface ExpenseEntry {
  id: string
  amount: number
  description: string
  expense_type: 'equipment' | 'tax' | 'supply' | 'other'
  entered_by: string | null
  date: string
  notes: string | null
  created_at: string
}

const TYPE_BADGE: Record<string, string> = {
  equipment: 'bg-blue-50 text-blue-700 border-blue-200',
  tax: 'bg-red-50 text-red-700 border-red-200',
  supply: 'bg-green-50 text-green-700 border-green-200',
  other: 'bg-slate-50 text-slate-600 border-slate-200',
}

export default function CogsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'wastage' | 'expenses' | 'purchases'>('wastage')
  const [wastage, setWastage] = useState<WastageEntry[]>([])
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([])
  const [purchases, setPurchases] = useState<StockEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Expense form
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [expenseType, setExpenseType] = useState<'equipment' | 'tax' | 'supply' | 'other'>('supply')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Edit purchase modal
  const [editingPurchase, setEditingPurchase] = useState<StockEntry | null>(null)
  const [editQty, setEditQty] = useState('')
  const [editCost, setEditCost] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [savingPurchase, setSavingPurchase] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [wRes, eRes, pRes] = await Promise.all([
      supabase
        .from('wastage_log')
        .select('*, cashier_profiles!cashier_id(name)')
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('expense_entries')
        .select('*')
        .order('date', { ascending: false })
        .limit(300),
      supabase
        .from('stock_entries')
        .select('*, products!product_id(name)')
        .order('created_at', { ascending: false })
        .limit(500),
    ])
    if (wRes.error) toast.error(wRes.error.message)
    if (eRes.error) toast.error(eRes.error.message)
    if (pRes.error) toast.error(pRes.error.message)
    setWastage(wRes.data || [])
    setExpenses(eRes.data || [])
    setPurchases(pRes.data || [])
    setLoading(false)
  }

  // Month boundaries
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthStartDate = monthStart.split('T')[0]

  const wastageThisMonth = wastage.filter(w => w.created_at >= monthStart)
  const wastageTotal = wastageThisMonth.reduce((sum, w) => sum + w.unit_cost * w.quantity, 0)

  const expensesThisMonth = expenses.filter(e => e.date >= monthStartDate)
  const expensesTotal = expensesThisMonth.reduce((sum, e) => sum + e.amount, 0)

  const purchasesThisMonth = purchases.filter(p => p.created_at >= monthStart)
  const purchasesTotal = purchasesThisMonth.reduce((sum, p) => {
    return sum + (p.cost_per_unit ?? 0) * p.quantity_added
  }, 0)

  async function deleteWastage(id: string) {
    if (!confirm('Delete this wastage entry?')) return
    setDeleting(id)
    const { error } = await supabase.from('wastage_log').delete().eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success('Wastage entry deleted'); loadData() }
    setDeleting(null)
  }

  async function deleteExpense(id: string) {
    if (!confirm('Delete this expense entry?')) return
    setDeleting(id)
    const { error } = await supabase.from('expense_entries').delete().eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success('Expense deleted'); loadData() }
    setDeleting(null)
  }

  async function deletePurchase(id: string) {
    if (!confirm('Delete this restock entry? This cannot be undone.')) return
    setDeleting(id)
    const { error } = await supabase.from('stock_entries').delete().eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success('Restock entry deleted'); loadData() }
    setDeleting(null)
  }

  function openEditPurchase(p: StockEntry) {
    setEditingPurchase(p)
    setEditQty(String(p.quantity_added))
    setEditCost(p.cost_per_unit != null ? String(p.cost_per_unit) : '')
    setEditNotes(p.notes ?? '')
  }

  async function saveEditPurchase() {
    if (!editingPurchase) return
    const qty = parseInt(editQty)
    if (!qty || qty < 1) { toast.error('Quantity must be at least 1'); return }
    setSavingPurchase(true)
    const { error } = await supabase.from('stock_entries').update({
      quantity_added: qty,
      cost_per_unit: editCost ? parseFloat(editCost) : null,
      notes: editNotes.trim() || null,
    }).eq('id', editingPurchase.id)
    if (error) { toast.error(error.message); setSavingPurchase(false); return }
    toast.success('Restock entry updated')
    setSavingPurchase(false)
    setEditingPurchase(null)
    loadData()
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault()
    if (!amount || !description.trim()) return
    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('expense_entries').insert({
      amount: parseFloat(amount),
      description: description.trim(),
      expense_type: expenseType,
      date,
      notes: notes.trim() || null,
      entered_by: user?.id || null,
    })
    if (error) { toast.error(error.message); setSubmitting(false); return }
    toast.success('Expense added')
    setAmount('')
    setDescription('')
    setNotes('')
    setSubmitting(false)
    loadData()
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">COGS &amp; Expenses</h1>
        <p className="text-slate-500 text-sm mt-1">Track wastage, spoilage, and operational expenses</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-6">
        {([
          ['wastage', 'Wastage Log'],
          ['expenses', 'Expenses'],
          ['purchases', 'Purchase History'],
        ] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* WASTAGE TAB */}
      {tab === 'wastage' && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-4 shadow-sm">
            <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Wastage Cost &mdash; This Month</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(wastageTotal)}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-sm text-slate-500">Entries this month</p>
              <p className="text-xl font-bold text-slate-700">{wastageThisMonth.length}</p>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Cashier</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Product</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Qty</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Unit Cost</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Total Loss</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Reason</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-slate-100 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : wastage.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                        No wastage entries yet. Use the POS &ldquo;Log Waste&rdquo; button to record spoilage.
                      </td>
                    </tr>
                  ) : wastage.map(w => (
                    <tr key={w.id} className="hover:bg-slate-50/50 group">
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {new Date(w.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {(w.cashier_profiles as any)?.name || <span className="text-slate-300">&mdash;</span>}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{w.product_name}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{w.quantity}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(w.unit_cost)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-red-600">
                        {formatCurrency(w.unit_cost * w.quantity)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{w.reason}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => deleteWastage(w.id)}
                          disabled={deleting === w.id}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PURCHASE HISTORY TAB */}
      {tab === 'purchases' && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-4 shadow-sm">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
              <ShoppingCart className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Inventory Spend &mdash; This Month</p>
              <p className="text-2xl font-bold text-emerald-700">{formatCurrency(purchasesTotal)}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-sm text-slate-500">Restocks this month</p>
              <p className="text-xl font-bold text-slate-700">{purchasesThisMonth.length}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Product</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Units</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Batch Cost/Unit</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Total</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Notes</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-slate-100 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : purchases.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                        No restocks recorded yet. Restock products from the Inventory page.
                      </td>
                    </tr>
                  ) : purchases.map(p => {
                    const total = (p.cost_per_unit ?? 0) * p.quantity_added
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50 group">
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {new Date(p.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {(p.products as any)?.name ?? <span className="text-slate-400 italic">Unknown product</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">{p.quantity_added}</td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {p.cost_per_unit != null ? formatCurrency(p.cost_per_unit) : <span className="text-slate-300">&mdash;</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                          {p.cost_per_unit != null ? formatCurrency(total) : <span className="text-slate-300">&mdash;</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {p.notes || <span className="text-slate-300">&mdash;</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all justify-end">
                            <button
                              onClick={() => openEditPurchase(p)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deletePurchase(p.id)}
                              disabled={deleting === p.id}
                              className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {purchases.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-slate-600 text-right">
                        All time total spend
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-800">
                        {formatCurrency(purchases.reduce((s, p) => s + (p.cost_per_unit ?? 0) * p.quantity_added, 0))}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* EXPENSES TAB */}
      {tab === 'expenses' && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-4 shadow-sm">
            <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Expenses &mdash; This Month</p>
              <p className="text-2xl font-bold text-violet-700">{formatCurrency(expensesTotal)}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-sm text-slate-500">Entries this month</p>
              <p className="text-xl font-bold text-slate-700">{expensesThisMonth.length}</p>
            </div>
          </div>

          {/* Add form */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h2 className="font-bold text-slate-900 mb-4 flex items-center gap-2 text-base">
              <Plus className="w-4 h-4" /> Add Expense
            </h2>
            <form onSubmit={handleAddExpense} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Amount ($) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Type *</label>
                <select
                  value={expenseType}
                  onChange={e => setExpenseType(e.target.value as typeof expenseType)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
                >
                  <option value="equipment">Equipment</option>
                  <option value="tax">Tax</option>
                  <option value="supply">Supply</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Description *</label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. Paper bags, fridge repair..."
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Date *</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Optional notes..."
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-xl text-sm transition-colors"
                >
                  {submitting ? 'Adding...' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>

          {/* Expenses table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Type</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Description</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Amount</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 5 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-slate-100 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : expenses.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                        No expenses logged yet.
                      </td>
                    </tr>
                  ) : expenses.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50/50 group">
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{e.date}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold border capitalize ${
                          TYPE_BADGE[e.expense_type] || TYPE_BADGE.other
                        }`}>
                          {e.expense_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {e.description}
                        {e.notes && <span className="text-slate-400 text-xs ml-2">{e.notes}</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {formatCurrency(e.amount)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => deleteExpense(e.id)}
                          disabled={deleting === e.id}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {/* Edit Purchase Modal */}
      {editingPurchase && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditingPurchase(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900">Edit Restock Entry</h2>
              <button onClick={() => setEditingPurchase(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-slate-500">
              {(editingPurchase.products as any)?.name ?? 'Unknown product'} &mdash;{' '}
              {new Date(editingPurchase.created_at).toLocaleDateString()}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Units added *</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={editQty}
                  onChange={e => setEditQty(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Batch cost/unit ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editCost}
                  onChange={e => setEditCost(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
              <input
                type="text"
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder="e.g. Costco deal, bulk order..."
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400"
              />
            </div>
            {editQty && editCost && (
              <p className="text-xs text-blue-600 bg-blue-50 rounded-xl px-3 py-2">
                Total batch cost: <strong>{formatCurrency(parseInt(editQty || '0') * parseFloat(editCost || '0'))}</strong>
              </p>
            )}
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setEditingPurchase(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEditPurchase}
                disabled={savingPurchase}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-xl text-sm transition-colors"
              >
                {savingPurchase ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
