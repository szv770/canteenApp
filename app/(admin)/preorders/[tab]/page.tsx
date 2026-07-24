'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import {
  Search, Check, X, Send, Copy, MessageCircle, Truck, ChefHat,
  Clock, DollarSign,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { computeVendorLedger, type VendorLedgerSummary } from '@/lib/preorderVendorLedger'
import { localDateStrInTz } from '@/lib/preorderCutoff'

type PreorderTab = 'orders' | 'vendor'
const VALID_TABS: PreorderTab[] = ['orders', 'vendor']
const TABS: { key: PreorderTab; label: string }[] = [
  { key: 'orders', label: 'Orders' },
  { key: 'vendor', label: 'Vendor' },
]

export default function PreordersPage() {
  const params = useParams<{ tab: string }>()
  const tab: PreorderTab = VALID_TABS.includes(params.tab as PreorderTab) ? (params.tab as PreorderTab) : 'orders'
  return (
    <div>
      <div className="flex gap-1 px-4 sm:px-6 pt-4 sm:pt-6 border-b border-slate-200 bg-white sticky top-0 z-10">
        {TABS.map(t => (
          <Link
            key={t.key}
            href={`/preorders/${t.key}`}
            className={`px-4 py-2.5 text-sm font-semibold -mb-px border-b-2 transition-colors ${
              tab === t.key ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {tab === 'orders' && <OrdersTab />}
      {tab === 'vendor' && <VendorTab />}
    </div>
  )
}

// ─── Orders tab ───────────────────────────────────────────────────────────

interface PreorderRow {
  id: string
  status: 'pending' | 'received' | 'cancelled'
  placed_via: 'pos' | 'public_link'
  is_staff_pricing: boolean
  total_amount: number
  bochur_name: string
  items: { product_name: string; quantity: number; unit_price: number; preorder_source: 'vendor' | 'in_house' }[]
}

function OrdersTab() {
  const supabase = createClient()
  const [date, setDate] = useState(localDateStrInTz(new Date()))
  const [rows, setRows] = useState<PreorderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [vendorSummary, setVendorSummary] = useState<string | null>(null)
  const [vendorPhone, setVendorPhone] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  useEffect(() => { loadData() }, [date])

  useEffect(() => {
    supabase.from('settings').select('value').eq('key', 'preorder_vendor_phone').single()
      .then(({ data }) => setVendorPhone(String(data?.value ?? '').replace(/"/g, '')))
  }, [])

  async function loadData() {
    setLoading(true)
    setVendorSummary(null)
    const { data, error } = await supabase
      .from('preorders')
      .select('id, status, placed_via, is_staff_pricing, total_amount, bochurim!bochur_id(name), preorder_items(product_name, quantity, unit_price, preorder_source)')
      .eq('for_date', date)
      .order('created_at')
    if (error) toast.error(error.message)
    setRows((data || []).map((r: any) => ({
      id: r.id,
      status: r.status,
      placed_via: r.placed_via,
      is_staff_pricing: r.is_staff_pricing,
      total_amount: Number(r.total_amount),
      bochur_name: r.bochurim?.name || 'Unknown',
      items: r.preorder_items || [],
    })))
    setLoading(false)
  }

  const active = rows.filter(r => r.status !== 'cancelled')
  const filtered = active.filter(r => r.bochur_name.toLowerCase().includes(search.toLowerCase()))

  // Aggregate by product, split vendor/in-house and camper/staff counts.
  const tally = new Map<string, { source: 'vendor' | 'in_house'; camper: number; staff: number }>()
  for (const r of active) {
    for (const item of r.items) {
      const entry = tally.get(item.product_name) || { source: item.preorder_source, camper: 0, staff: 0 }
      if (r.is_staff_pricing) entry.staff += item.quantity
      else entry.camper += item.quantity
      tally.set(item.product_name, entry)
    }
  }
  const vendorTally = Array.from(tally.entries()).filter(([, v]) => v.source === 'vendor')
  const inHouseTally = Array.from(tally.entries()).filter(([, v]) => v.source === 'in_house')

  async function confirmReceived(preorderId: string, name: string) {
    setConfirmingId(preorderId)
    try {
      const res = await fetch('/api/pos/preorder-confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preorder_id: preorderId }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error === 'Insufficient balance'
          ? `${name} is short ${formatCurrency(json.shortfall)} — top up first`
          : (json.error || 'Failed to confirm'))
        return
      }
      toast.success(`Charged ${formatCurrency(json.charged)} to ${name}`)
      loadData()
    } finally {
      setConfirmingId(null)
    }
  }

  async function cancelOrder(preorderId: string) {
    if (!confirm('Cancel this order? It will never be charged.')) return
    const { error } = await supabase.from('preorders').update({
      status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: 'Cancelled by admin',
    }).eq('id', preorderId)
    if (error) { toast.error(error.message); return }
    toast.success('Order cancelled')
    loadData()
  }

  async function sendToVendor() {
    setSending(true)
    try {
      const res = await fetch('/api/admin/preorders/send-to-vendor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ for_date: date }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed to send'); return }
      setVendorSummary(json.summary)
      toast.success(`Marked ${json.orders_marked} order(s) as sent`)
    } finally {
      setSending(false)
    }
  }

  function copySummary() {
    if (!vendorSummary) return
    navigator.clipboard.writeText(vendorSummary)
    toast.success('Copied to clipboard')
  }

  const whatsappHref = vendorSummary && vendorPhone
    ? `https://wa.me/${vendorPhone.replace(/\D/g, '')}?text=${encodeURIComponent(vendorSummary)}`
    : null

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Preorders</h1>
          <p className="text-slate-500 text-sm mt-1">Vendor items and in-house made-to-order items</p>
        </div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-admin w-auto" />
      </div>

      {/* Aggregate summary */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="admin-card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Truck className="w-4 h-4 text-slate-400" /> Send to vendor</p>
            <button onClick={sendToVendor} disabled={sending || vendorTally.length === 0} className="btn-primary text-xs px-2.5 py-1.5">
              <Send className="w-3.5 h-3.5" /> {sending ? 'Sending…' : 'Send to Vendor'}
            </button>
          </div>
          {vendorTally.length === 0 ? (
            <p className="text-sm text-slate-300 italic">No vendor items for this date</p>
          ) : (
            <ul className="text-sm text-slate-700 space-y-1">
              {vendorTally.map(([name, v]) => (
                <li key={name} className="flex justify-between">
                  <span>{name}</span>
                  <span className="text-slate-400">×{v.camper + v.staff} <span className="text-xs">({v.camper} camper, {v.staff} staff)</span></span>
                </li>
              ))}
            </ul>
          )}
          {vendorSummary && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
              <pre className="text-xs text-slate-600 whitespace-pre-wrap bg-slate-50 rounded-lg p-2">{vendorSummary}</pre>
              <div className="flex gap-2">
                <button onClick={copySummary} className="btn-secondary text-xs px-2.5 py-1.5"><Copy className="w-3.5 h-3.5" /> Copy</button>
                {whatsappHref && (
                  <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs px-2.5 py-1.5">
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="admin-card p-4">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-3"><ChefHat className="w-4 h-4 text-slate-400" /> To prepare (in-house)</p>
          {inHouseTally.length === 0 ? (
            <p className="text-sm text-slate-300 italic">No in-house items for this date</p>
          ) : (
            <ul className="text-sm text-slate-700 space-y-1">
              {inHouseTally.map(([name, v]) => (
                <li key={name} className="flex justify-between">
                  <span>{name}</span>
                  <span className="text-slate-400">×{v.camper + v.staff} <span className="text-xs">({v.camper} camper, {v.staff} staff)</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Per-person list */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name..." className="input-admin pl-9" />
      </div>

      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Items</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Total</th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Status</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-sm">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-sm">No orders for this date</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="table-row">
                  <td className="px-4 py-3">
                    <span className="text-sm font-semibold text-slate-900">{r.bochur_name}</span>
                    {r.is_staff_pricing && <span className="ml-1.5 badge bg-purple-50 text-purple-700 border border-purple-100 text-xs">Staff</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {r.items.map(i => `${i.product_name} ×${i.quantity}`).join(', ')}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-900 text-right">{formatCurrency(r.total_amount)}</td>
                  <td className="px-4 py-3 text-center">
                    {r.status === 'received' ? (
                      <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-100">Received</span>
                    ) : (
                      <span className="badge bg-amber-50 text-amber-700 border border-amber-100 flex items-center gap-1 w-fit mx-auto"><Clock className="w-3 h-3" /> Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.status === 'pending' && (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => confirmReceived(r.id, r.bochur_name)}
                          disabled={confirmingId === r.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" /> Confirm Received
                        </button>
                        <button
                          onClick={() => cancelOrder(r.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Cancel order"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Vendor tab ───────────────────────────────────────────────────────────

const ACCOUNT_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'stripe', label: 'Credit Card' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'cashapp', label: 'Cash App' },
]

function VendorTab() {
  const supabase = createClient()
  const [ledger, setLedger] = useState<VendorLedgerSummary | null>(null)
  const [vendorName, setVendorName] = useState('')
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState('cash')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [summary, { data: nameSetting }, { data: paymentRows }] = await Promise.all([
      computeVendorLedger(supabase),
      supabase.from('settings').select('value').eq('key', 'preorder_vendor_name').single(),
      supabase.from('withdrawal_log').select('*').eq('reason', 'vendor_payment').order('date', { ascending: false }),
    ])
    setLedger(summary)
    setVendorName(String(nameSetting?.value ?? '').replace(/"/g, ''))
    setPayments(paymentRows || [])
    setLoading(false)
  }

  async function logPayment() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { toast.error('Enter an amount'); return }
    setSaving(true)
    const { error } = await supabase.from('withdrawal_log').insert({
      account, amount: amt, reason: 'vendor_payment',
      paid_to: vendorName || 'Vendor', note: note.trim() || null,
    })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Payment logged')
    setAmount(''); setNote('')
    loadData()
  }

  if (loading || !ledger) return <div className="p-6 text-slate-400">Loading...</div>

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Vendor Ledger{vendorName ? ` — ${vendorName}` : ''}</h1>
        <p className="text-slate-500 text-sm mt-1">
          Owed accrues {ledger.accrualMode === 'on_send' ? 'when an order is sent to the vendor' : 'once each order is confirmed received'} — change this in Settings.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="admin-card p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Owed</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(ledger.owed)}</p>
        </div>
        <div className="admin-card p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Paid</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(ledger.paid)}</p>
        </div>
        <div className="admin-card p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Balance Due</p>
          <p className={`text-xl font-bold mt-1 ${ledger.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(ledger.balance)}</p>
        </div>
      </div>

      <div className="admin-card p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><DollarSign className="w-4 h-4 text-slate-400" /> Log a payment to the vendor</p>
        <div className="grid sm:grid-cols-[140px_1fr] gap-3">
          <select value={account} onChange={e => setAccount(e.target.value)} className="input-admin">
            {ACCOUNT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input type="number" step={0.01} min={0} placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} className="input-admin" />
        </div>
        <input type="text" placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} className="input-admin" />
        <button onClick={logPayment} disabled={saving} className="btn-primary text-sm">{saving ? 'Saving...' : 'Log Payment'}</button>
        <p className="text-xs text-slate-400">This also appears in Finance → Accounts as a withdrawal.</p>
      </div>

      <div className="admin-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-700">Payment history</p>
        </div>
        {payments.length === 0 ? (
          <p className="px-4 py-8 text-center text-slate-400 text-sm">No payments logged yet</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {payments.map(p => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm text-slate-700">{p.date} — {ACCOUNT_OPTIONS.find(o => o.value === p.account)?.label || p.account}</p>
                  {p.note && <p className="text-xs text-slate-400">{p.note}</p>}
                </div>
                <span className="text-sm font-semibold text-slate-900">{formatCurrency(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
