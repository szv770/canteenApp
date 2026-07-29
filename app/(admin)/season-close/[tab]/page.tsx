'use client'

/**
 * Season Close — the end-of-summer wind-down hub.
 *
 * Everything here is READ-ONLY on purpose. It answers "who and what is still
 * unresolved" so the owner can work through it, but it never decides policy or
 * moves money on its own: no bulk refund, no bulk balance zeroing, no
 * auto-cancelling of stale preorders, no inventory write-off button. Those are
 * business decisions with real money consequences and they stay in the owner's
 * hands, through the existing per-student refund flow (Students → click a row →
 * Refund Balance) and the existing per-order Preorders cancel.
 *
 * Numbers that already exist elsewhere are imported rather than recomputed:
 *   net cash per account → lib/accountBalances.ts (shared with Finance → Accounts)
 *   vendor owed / paid   → lib/preorderVendorLedger.ts (shared with Preorders → Vendor)
 * Revenue / COGS / profit are deliberately NOT recomputed — Reports → Profit &
 * COGS stays the single source of truth, and this page links to it instead.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import {
  Users, Package, ClipboardList, FlagTriangleRight, Download, Search,
  AlertTriangle, ExternalLink, RefreshCw, Clock, Truck, Wallet, ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import BochurProfileModal from '@/app/(admin)/bochurim/BochurProfileModal'
import type { AccountType, BochurWithId } from '@/types/database'
import { computeNetAccountBalances, ACCOUNT_ORDER, ACCOUNT_LABELS } from '@/lib/accountBalances'
import { computeVendorLedger, type VendorLedgerSummary } from '@/lib/preorderVendorLedger'
import {
  fetchOutstandingBalances, fetchInventoryValuation, fetchLooseEnds,
  csvLine, downloadCSV, localDateStr,
  type OutstandingBalances, type InventoryValuation, type LooseEnds,
} from '@/lib/seasonClose'

type SeasonTab = 'summary' | 'balances' | 'inventory' | 'loose-ends'
const VALID_TABS: SeasonTab[] = ['summary', 'balances', 'inventory', 'loose-ends']
const TABS: { key: SeasonTab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'balances', label: 'Student Balances' },
  { key: 'inventory', label: 'Leftover Stock' },
  { key: 'loose-ends', label: 'Loose Ends' },
]

export default function SeasonClosePage() {
  const params = useParams<{ tab: string }>()
  const tab: SeasonTab = VALID_TABS.includes(params.tab as SeasonTab) ? (params.tab as SeasonTab) : 'summary'

  return (
    <div>
      <div className="flex items-center gap-2 px-4 sm:px-6 pt-4 sm:pt-6 border-b border-slate-200 bg-white sticky top-0 z-10 overflow-x-auto">
        {TABS.map(t => (
          <Link
            key={t.key}
            href={`/season-close/${t.key}`}
            className={`px-4 py-2.5 text-sm font-semibold -mb-px border-b-2 whitespace-nowrap transition-colors ${
              tab === t.key ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {tab === 'summary' && <SummaryTab />}
      {tab === 'balances' && <BalancesTab />}
      {tab === 'inventory' && <InventoryTab />}
      {tab === 'loose-ends' && <LooseEndsTab />}
    </div>
  )
}

// ─── Shared bits ──────────────────────────────────────────────────────────────

// Same fetch-by-id wrapper around BochurProfileModal that reports/transactions/
// cashiers/topups/cashier-dashboard each define locally — see CLAUDE.md gotcha
// #24: this is a copy-pasted pattern, not a shared component. If its behaviour
// ever needs to change, grep for StudentProfilePanel across the repo.
function StudentProfilePanel({
  bochurId, accountTypes, onClose,
}: { bochurId: string; accountTypes: AccountType[]; onClose: () => void }) {
  const supabase = createClient()
  const [bochur, setBochur] = useState<BochurWithId | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('bochurim_with_id')
      .select('*, account_type:account_types(*)')
      .eq('id', bochurId).single()
      .then(({ data }) => { setBochur(data as any); setLoading(false) })
  // supabase client is stable across renders
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bochurId])

  if (loading) return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8"><div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /></div>
    </div>
  )
  if (!bochur) return null
  return <BochurProfileModal bochur={bochur} accountTypes={accountTypes} onClose={onClose} onUpdated={onClose} />
}

function PageHeader({
  icon: Icon, title, sub, action,
}: { icon: React.ElementType; title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shadow-sm shrink-0">
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
          <p className="text-slate-500 text-sm mt-0.5 max-w-2xl">{sub}</p>
        </div>
      </div>
      {action}
    </div>
  )
}

function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null
  return (
    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

function StatCard({
  label, value, sub, tone = 'slate',
}: { label: string; value: string; sub?: string; tone?: 'slate' | 'emerald' | 'red' | 'amber' }) {
  const valueColor = {
    slate: 'text-slate-900', emerald: 'text-emerald-600', red: 'text-red-600', amber: 'text-amber-600',
  }[tone]
  return (
    <div className="admin-card p-4">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-1 ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

function daysAgoLabel(iso: string | null): string {
  if (!iso) return 'Never bought'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

// ─── Summary tab ──────────────────────────────────────────────────────────────

function SummaryTab() {
  const supabase = createClient()
  const [balances, setBalances] = useState<OutstandingBalances | null>(null)
  const [inventory, setInventory] = useState<InventoryValuation | null>(null)
  const [loose, setLoose] = useState<LooseEnds | null>(null)
  const [vendor, setVendor] = useState<VendorLedgerSummary | null>(null)
  const [net, setNet] = useState<{ received: Record<string, number>; withdrawn: Record<string, number> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [b, inv, l, v, n] = await Promise.all([
      fetchOutstandingBalances(supabase),
      fetchInventoryValuation(supabase),
      fetchLooseEnds(supabase),
      computeVendorLedger(supabase),
      computeNetAccountBalances(supabase),
    ])
    setBalances(b); setInventory(inv); setLoose(l); setVendor(v); setNet(n)
    const firstErr = b.error || inv.error || l.error || v.error || n.error
    if (firstErr) toast.error(firstErr)
    setLoading(false)
  }

  // One file with every close-out list in it — student balances, leftover
  // stock, and unresolved preorders — as separate labelled blocks, so the whole
  // thing can go straight to a bookkeeper without opening three screens.
  function exportEverything() {
    if (!balances || !inventory || !loose) return
    setExporting(true)
    try {
      const lines: string[] = []
      lines.push(csvLine(['SEASON CLOSE EXPORT', localDateStr()]))
      lines.push('')

      lines.push(csvLine(['SECTION', 'Student balances']))
      lines.push(csvLine(['Student ID', 'Name', 'Grade', 'Phone', 'Account Type', 'Balance', 'Status', 'Last Purchase']))
      for (const r of balances.rows) {
        lines.push(csvLine([
          r.bochurId, r.name, r.grade, r.phone, r.accountTypeName, r.balance.toFixed(2),
          [r.archived ? 'Archived' : 'Active', r.isFrozen ? 'Frozen' : ''].filter(Boolean).join(' / '),
          r.lastOrderAt ? r.lastOrderAt.slice(0, 10) : 'Never',
        ]))
      }
      lines.push(csvLine(['', 'Owed to students (total)', '', '', '', balances.owedToStudents.toFixed(2)]))
      lines.push(csvLine(['', 'Owed by students (total)', '', '', '', balances.owedByStudents.toFixed(2)]))
      lines.push('')

      lines.push(csvLine(['SECTION', 'Leftover stock']))
      lines.push(csvLine(['Product', 'Variant', 'Units Left', 'Value at Cost', 'Value at Retail', 'Product Status']))
      for (const r of inventory.rows) {
        if (r.variants.length > 0) {
          for (const v of r.variants) {
            lines.push(csvLine([r.name, v.label, v.units, v.costValue.toFixed(2), v.retailValue.toFixed(2), r.isActive ? 'Active' : 'Inactive']))
          }
        } else {
          lines.push(csvLine([r.name, '', r.units, r.costValue.toFixed(2), r.retailValue.toFixed(2), r.isActive ? 'Active' : 'Inactive']))
        }
      }
      lines.push(csvLine(['', 'TOTAL', inventory.totalUnits, inventory.totalCostValue.toFixed(2), inventory.totalRetailValue.toFixed(2)]))
      lines.push('')

      lines.push(csvLine(['SECTION', 'Unresolved preorders (still pending)']))
      lines.push(csvLine(['For Date', 'Name', 'Items', 'Total', 'Placed Via', 'Sent To Vendor', 'Past Date?']))
      for (const p of loose.pendingPreorders) {
        lines.push(csvLine([
          p.forDate, p.bochurName, p.itemSummary, p.total.toFixed(2),
          p.placedVia === 'pos' ? 'POS' : 'Public link',
          p.sentToVendor ? 'Yes' : 'No', p.isStale ? 'Yes' : 'No',
        ]))
      }

      downloadCSV(`season-close-${localDateStr()}.csv`, lines)
      toast.success('CSV downloaded — open it in Google Sheets via File > Import')
    } catch (err: any) {
      toast.error('Export failed: ' + (err?.message || 'unknown error'))
    } finally {
      setExporting(false)
    }
  }

  const netRows = net
    ? ACCOUNT_ORDER
        .map(key => {
          const received = net.received[key] || 0
          const withdrawn = net.withdrawn[key] || 0
          return { key, label: ACCOUNT_LABELS[key], net: received - withdrawn }
        })
        .filter(r => r.net !== 0)
    : []
  const netTotal = netRows.reduce((s, r) => s + r.net, 0)

  const openItems = loose
    ? loose.pendingPreorders.length + loose.pendingTopupCount + loose.pendingRefundRequestCount
      + loose.unconfirmedWithdrawalCount + loose.unpaidTips.length
    : 0

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        icon={FlagTriangleRight}
        title="Season Close"
        sub="Everything still open at the end of the summer, in one place. This page only reports — it never refunds, cancels, or writes anything off on its own."
        action={
          <div className="flex items-center gap-2">
            <button onClick={loadAll} disabled={loading} className="btn-secondary text-sm">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button onClick={exportEverything} disabled={loading || exporting} className="btn-primary text-sm">
              <Download className="w-4 h-4" /> {exporting ? 'Exporting…' : 'Export Everything'}
            </button>
          </div>
        }
      />

      {loading ? (
        <div className="admin-card p-8 text-center text-slate-400 text-sm">Loading season totals…</div>
      ) : (
        <>
          {/* What the canteen still owes / is owed */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Still owed, either direction</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                label="Owed to students"
                value={formatCurrency(balances?.owedToStudents ?? 0)}
                sub={`${balances?.rows.filter(r => r.balance > 0).length ?? 0} accounts in credit`}
                tone="red"
              />
              <StatCard
                label="Owed by students"
                value={formatCurrency(balances?.owedByStudents ?? 0)}
                sub={`${balances?.rows.filter(r => r.balance < 0).length ?? 0} accounts negative`}
                tone={(balances?.owedByStudents ?? 0) > 0 ? 'amber' : 'slate'}
              />
              <StatCard
                label="Owed to vendor"
                value={formatCurrency(vendor?.balance ?? 0)}
                sub={`${formatCurrency(vendor?.owed ?? 0)} accrued − ${formatCurrency(vendor?.paid ?? 0)} paid`}
                tone={(vendor?.balance ?? 0) > 0 ? 'red' : 'emerald'}
              />
              <StatCard
                label="Open items"
                value={String(openItems)}
                sub="Preorders, top-ups, refund requests, withdrawals, unpaid tips"
                tone={openItems > 0 ? 'amber' : 'emerald'}
              />
            </div>
          </section>

          {/* Cash position */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Cash position, all-time</h2>
              <Link href="/finance/accounts" className="text-xs font-semibold text-amber-600 hover:text-amber-700">
                Full Accounts page →
              </Link>
            </div>
            <p className="text-xs text-slate-400 -mt-1">
              Exactly the same figures as Finance → Accounts &ldquo;Net Account Balances&rdquo; — both read the same shared calculation, so they can never drift apart.
            </p>
            {netRows.length === 0 ? (
              <div className="admin-card p-5 text-sm text-slate-400 text-center">No account activity recorded.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {netRows.map(r => (
                  <StatCard key={r.key} label={r.label} value={formatCurrency(r.net)} tone={r.net < 0 ? 'red' : 'slate'} />
                ))}
                <StatCard label="All accounts" value={formatCurrency(netTotal)} tone="emerald" />
              </div>
            )}
          </section>

          {/* Leftover stock */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Stock still on the shelf</h2>
              <Link href="/season-close/inventory" className="text-xs font-semibold text-amber-600 hover:text-amber-700">
                Full breakdown →
              </Link>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <StatCard label="Value at cost" value={formatCurrency(inventory?.totalCostValue ?? 0)} sub="What you paid for what's left" />
              <StatCard label="Value at retail" value={formatCurrency(inventory?.totalRetailValue ?? 0)} sub="What it'd bring in if it all sold" />
              <StatCard label="Units left" value={String(inventory?.totalUnits ?? 0)} sub={`${inventory?.rows.length ?? 0} products with stock`} />
            </div>
          </section>

          {/* P&L pointer — deliberately not recomputed here */}
          <section className="admin-card p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">Season profit &amp; loss</p>
              <p className="text-xs text-slate-400 mt-0.5 max-w-xl">
                Revenue, COGS, expenses, wastage and net profit are not repeated here on purpose — Reports is the one place those are calculated, and a second version that disagreed by a few dollars would cause more trouble than it solves. Open Reports and pick the <span className="font-medium">☀️ This Summer</span> preset.
              </p>
            </div>
            <Link href="/reports/profit" className="btn-secondary text-sm shrink-0">
              <ExternalLink className="w-4 h-4" /> Reports → Profit &amp; COGS
            </Link>
          </section>

          {/* Decisions the owner has to make */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Decisions this page will not make for you</h2>
            <div className="admin-card p-4 space-y-3 text-sm text-slate-600">
              <p className="text-xs text-slate-400">
                Each of these is a real money decision with no obviously-right answer, so nothing here is automated. Once you&apos;ve decided, the existing per-student and per-order tools carry it out.
              </p>
              <DecisionRow
                title="Unspent student balances"
                amount={formatCurrency(balances?.owedToStudents ?? 0)}
                body="Refund to parents, roll over to next summer, or forfeit after a stated cut-off? Refunds are done one student at a time from Students → click a row → Refund Balance, which logs the payout so it shows up in Accounts."
                href="/season-close/balances"
                cta="See who has a balance"
              />
              <DecisionRow
                title="Students with a negative balance"
                amount={formatCurrency(balances?.owedByStudents ?? 0)}
                body="Chase the parents before everyone leaves, or write it off? Once campers go home this is very hard to collect."
                href="/season-close/balances"
                cta="See who owes"
              />
              <DecisionRow
                title="Leftover stock"
                amount={formatCurrency(inventory?.totalCostValue ?? 0)}
                body="Store it for next season, sell it off in the last week, donate it, or write it off as a loss? Only genuinely spoiled/unusable stock belongs in the Wastage log — writing off perfectly good stock there would overstate this season's losses."
                href="/season-close/inventory"
                cta="See what's left"
              />
              <DecisionRow
                title="Preorders never picked up"
                amount={`${loose?.stalePreorderCount ?? 0} past-dated`}
                body="A pending preorder has never charged anyone. Cancel them (nobody pays, and you eat the vendor cost) or confirm them (the student's balance gets charged)? Either way, decide before balances get refunded — a refund first makes a later charge bounce."
                href="/season-close/loose-ends"
                cta="See what's pending"
              />
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function DecisionRow({
  title, amount, body, href, cta,
}: { title: string; amount: string; body: string; href: string; cta: string }) {
  return (
    <div className="border border-slate-100 rounded-xl p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold text-slate-800">{title}</p>
        <span className="text-sm font-bold text-slate-700 shrink-0">{amount}</span>
      </div>
      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{body}</p>
      <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-700 mt-2">
        {cta} <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  )
}

// ─── Student balances tab ─────────────────────────────────────────────────────

type BalanceFilter = 'credit' | 'debt' | 'all'

function BalancesTab() {
  const supabase = createClient()
  const [data, setData] = useState<OutstandingBalances | null>(null)
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<BalanceFilter>('credit')
  const [minAmount, setMinAmount] = useState('')
  const [includeArchived, setIncludeArchived] = useState(true)
  const [profileId, setProfileId] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [b, { data: types }] = await Promise.all([
      fetchOutstandingBalances(supabase),
      supabase.from('account_types').select('*').order('name'),
    ])
    if (b.error) toast.error(b.error)
    setData(b)
    setAccountTypes((types || []) as AccountType[])
    setLoading(false)
  }

  const min = parseFloat(minAmount)
  const rows = (data?.rows || [])
    .filter(r => (filter === 'all' ? true : filter === 'credit' ? r.balance > 0 : r.balance < 0))
    .filter(r => (includeArchived ? true : !r.archived))
    .filter(r => (!isNaN(min) && min > 0 ? Math.abs(r.balance) >= min : true))
    .filter(r =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.bochurId || '').toLowerCase().includes(search.toLowerCase())
    )

  const shownTotal = rows.reduce((s, r) => s + r.balance, 0)
  const archivedWithMoney = (data?.rows || []).filter(r => r.archived).length

  function exportCSV() {
    if (!rows.length) { toast.error('Nothing to export with the current filters'); return }
    const lines = [csvLine(['Student ID', 'Name', 'Grade', 'Phone', 'Account Type', 'Balance', 'Status', 'Last Purchase'])]
    for (const r of rows) {
      lines.push(csvLine([
        r.bochurId, r.name, r.grade, r.phone, r.accountTypeName, r.balance.toFixed(2),
        [r.archived ? 'Archived' : 'Active', r.isFrozen ? 'Frozen' : ''].filter(Boolean).join(' / '),
        r.lastOrderAt ? r.lastOrderAt.slice(0, 10) : 'Never',
      ]))
    }
    lines.push(csvLine(['', 'TOTAL', '', '', '', shownTotal.toFixed(2)]))
    downloadCSV(`student-balances-${localDateStr()}.csv`, lines)
    toast.success('CSV downloaded — open it in Google Sheets via File > Import')
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <PageHeader
        icon={Users}
        title="Student Balances"
        sub="Every account still holding money — in either direction — sorted biggest first. Use it as a refund checklist: click a name to open their profile, where the existing Refund Balance flow logs the payout properly."
        action={
          <button onClick={exportCSV} disabled={loading} className="btn-secondary text-sm">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        }
      />

      <ErrorBanner message={data?.error} />

      {data && data.lastOrderTruncated && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Some &ldquo;last purchase&rdquo; dates couldn&apos;t be loaded, so a few rows may read &ldquo;Never bought&rdquo; incorrectly. Balances themselves are unaffected.</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard
          label="Owed to students"
          value={formatCurrency(data?.owedToStudents ?? 0)}
          sub={`${data?.rows.filter(r => r.balance > 0).length ?? 0} accounts in credit`}
          tone="red"
        />
        <StatCard
          label="Owed by students"
          value={formatCurrency(data?.owedByStudents ?? 0)}
          sub={`${data?.rows.filter(r => r.balance < 0).length ?? 0} accounts negative`}
          tone={(data?.owedByStudents ?? 0) > 0 ? 'amber' : 'slate'}
        />
        <StatCard
          label="Showing"
          value={formatCurrency(shownTotal)}
          sub={`${rows.length} of ${data?.rows.length ?? 0} accounts`}
        />
      </div>

      {archivedWithMoney > 0 && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold">{archivedWithMoney} archived account{archivedWithMoney !== 1 ? 's' : ''}</span> still {archivedWithMoney !== 1 ? 'have' : 'has'} a non-zero balance. Archived students don&apos;t appear in the normal Students list, so these are the easiest ones to leave behind.
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="admin-card p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Name or student ID…"
              className="input-admin pl-9"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Show</label>
          <div className="flex gap-1">
            {([
              { key: 'credit', label: 'In credit' },
              { key: 'debt', label: 'Negative' },
              { key: 'all', label: 'Both' },
            ] as { key: BalanceFilter; label: string }[]).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  filter === f.key ? 'bg-amber-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-amber-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="w-32">
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Min amount</label>
          <input
            type="number"
            min={0}
            step={1}
            value={minAmount}
            onChange={e => setMinAmount(e.target.value)}
            placeholder="Any"
            className="input-admin"
          />
        </div>
        <button
          onClick={() => setIncludeArchived(v => !v)}
          className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            includeArchived ? 'bg-white border border-slate-200 text-slate-600 hover:border-amber-300' : 'bg-slate-800 text-white'
          }`}
        >
          {includeArchived ? 'Including archived' : 'Active only'}
        </button>
      </div>

      {/* Table */}
      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">ID</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Account Type</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Phone</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Last Purchase</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Balance</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-sm">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-sm">
                  No accounts match these filters.
                </td></tr>
              ) : rows.map(r => (
                <tr key={r.id} className="table-row cursor-pointer" onClick={() => setProfileId(r.id)}>
                  <td className="px-4 py-3 text-sm font-mono text-slate-500">{r.bochurId || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{r.name}</span>
                      {r.archived && (
                        <span className="badge bg-slate-100 text-slate-500 border border-slate-200">Archived</span>
                      )}
                      {r.isFrozen && (
                        <span className="badge bg-red-50 text-red-600 border border-red-100">Frozen</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{r.accountTypeName || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{r.phone || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    <span className={r.lastOrderAt ? '' : 'text-slate-300 italic'}>{daysAgoLabel(r.lastOrderAt)}</span>
                  </td>
                  <td className={`px-4 py-3 text-sm font-bold text-right ${r.balance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {formatCurrency(r.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {profileId && (
        <StudentProfilePanel
          bochurId={profileId}
          accountTypes={accountTypes}
          onClose={() => { setProfileId(null); loadData() }}
        />
      )}
    </div>
  )
}

// ─── Leftover stock tab ───────────────────────────────────────────────────────

function InventoryTab() {
  const supabase = createClient()
  const [data, setData] = useState<InventoryValuation | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const inv = await fetchInventoryValuation(supabase)
    if (inv.error) toast.error(inv.error)
    setData(inv)
    setLoading(false)
  }

  const rows = (data?.rows || []).filter(r => r.name.toLowerCase().includes(search.toLowerCase()))

  function exportCSV() {
    if (!data || data.rows.length === 0) { toast.error('No stock to export'); return }
    const lines = [csvLine(['Product', 'Variant', 'Units Left', 'Value at Cost', 'Value at Retail', 'Product Status'])]
    for (const r of data.rows) {
      if (r.variants.length > 0) {
        for (const v of r.variants) {
          lines.push(csvLine([r.name, v.label, v.units, v.costValue.toFixed(2), v.retailValue.toFixed(2), r.isActive ? 'Active' : 'Inactive']))
        }
      } else {
        lines.push(csvLine([r.name, '', r.units, r.costValue.toFixed(2), r.retailValue.toFixed(2), r.isActive ? 'Active' : 'Inactive']))
      }
    }
    lines.push(csvLine(['', 'TOTAL', data.totalUnits, data.totalCostValue.toFixed(2), data.totalRetailValue.toFixed(2)]))
    downloadCSV(`leftover-stock-${localDateStr()}.csv`, lines)
    toast.success('CSV downloaded — open it in Google Sheets via File > Import')
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <PageHeader
        icon={Package}
        title="Leftover Stock"
        sub="What's physically left on the shelf and what it's worth, for the final books. This is a valuation, not a write-off — nothing here changes stock levels or logs wastage."
        action={
          <button onClick={exportCSV} disabled={loading} className="btn-secondary text-sm">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        }
      />

      <ErrorBanner message={data?.error} />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="Value at cost" value={formatCurrency(data?.totalCostValue ?? 0)} sub="What you paid for what's left" />
        <StatCard label="Value at retail" value={formatCurrency(data?.totalRetailValue ?? 0)} sub="If every unit still sold" tone="emerald" />
        <StatCard label="Units left" value={String(data?.totalUnits ?? 0)} sub={`across ${data?.rows.length ?? 0} products`} />
      </div>

      {/* Honesty caveats — these numbers are a floor, not a full count */}
      {(data?.untrackedProductNames.length || data?.missingCostProductNames.length) ? (
        <div className="space-y-2">
          {data.untrackedProductNames.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
              <span>
                <span className="font-semibold">{data.untrackedProductNames.length} product{data.untrackedProductNames.length !== 1 ? 's' : ''}</span> don&apos;t track stock at all (stock left blank = unlimited), so they can&apos;t be counted or valued here — count those by hand: {data.untrackedProductNames.slice(0, 8).join(', ')}{data.untrackedProductNames.length > 8 ? `, +${data.untrackedProductNames.length - 8} more` : ''}.
              </span>
            </div>
          )}
          {data.missingCostProductNames.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                <span className="font-semibold">{data.missingCostProductNames.length} product{data.missingCostProductNames.length !== 1 ? 's' : ''}</span> have leftover units but no cost price set, so they add $0 to the cost total above — it&apos;s under-reported until those are filled in: {data.missingCostProductNames.slice(0, 8).join(', ')}{data.missingCostProductNames.length > 8 ? `, +${data.missingCostProductNames.length - 8} more` : ''}.
              </span>
            </div>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…" className="input-admin pl-9" />
        </div>
        <Link href="/products/inventory" className="btn-secondary text-sm shrink-0">
          <ExternalLink className="w-4 h-4" /> Inventory → Slow Movers
        </Link>
      </div>
      <p className="text-xs text-slate-400 -mt-2">
        Slow Movers on the Inventory page shows which of this stock hasn&apos;t sold in 30 days — the closest thing to &ldquo;this will definitely not sell in the last week.&rdquo;
      </p>

      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Product</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Units Left</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Value at Cost</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Value at Retail</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-4 py-12 text-center text-slate-400 text-sm">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-12 text-center text-slate-400 text-sm">
                  No products with leftover stock.
                </td></tr>
              ) : rows.map(r => (
                <tr key={r.productId} className="table-row align-top">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{r.icon ? `${r.icon} ` : ''}{r.name}</span>
                      {!r.isActive && <span className="badge bg-slate-100 text-slate-500 border border-slate-200">Inactive</span>}
                    </div>
                    {r.variants.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {r.variants.map(v => (
                          <li key={v.label} className="text-xs text-slate-400">
                            {v.label} — {v.units} left, {formatCurrency(v.costValue)} at cost
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 text-right font-medium">{r.units}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-900 text-right">{formatCurrency(r.costValue)}</td>
                  <td className="px-4 py-3 text-sm text-slate-500 text-right">{formatCurrency(r.retailValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Loose ends tab ───────────────────────────────────────────────────────────

function LooseEndsTab() {
  const supabase = createClient()
  const [data, setData] = useState<LooseEnds | null>(null)
  const [vendor, setVendor] = useState<VendorLedgerSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [l, v] = await Promise.all([fetchLooseEnds(supabase), computeVendorLedger(supabase)])
    if (l.error) toast.error(l.error)
    if (v.error) toast.error(v.error)
    setData(l); setVendor(v)
    setLoading(false)
  }

  const pending = data?.pendingPreorders || []
  const stale = pending.filter(p => p.isStale)
  const upcoming = pending.filter(p => !p.isStale)

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <PageHeader
        icon={ClipboardList}
        title="Loose Ends"
        sub="Anything still sitting unresolved anywhere in the system, across every date — the things most likely to be quietly forgotten once camp empties out."
        action={
          <button onClick={loadData} disabled={loading} className="btn-secondary text-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        }
      />

      <ErrorBanner message={data?.error} />

      {loading ? (
        <div className="admin-card p-8 text-center text-slate-400 text-sm">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="Pending preorders"
              value={String(pending.length)}
              sub={`${stale.length} past their date · ${formatCurrency(data?.pendingPreorderTotal ?? 0)} uncharged`}
              tone={stale.length > 0 ? 'amber' : 'slate'}
            />
            <StatCard
              label="Top-ups awaiting approval"
              value={String(data?.pendingTopupCount ?? 0)}
              sub={`${formatCurrency(data?.pendingTopupTotal ?? 0)} not yet credited`}
              tone={(data?.pendingTopupCount ?? 0) > 0 ? 'amber' : 'slate'}
            />
            <StatCard
              label="Refund requests open"
              value={String(data?.pendingRefundRequestCount ?? 0)}
              sub={`${formatCurrency(data?.pendingRefundRequestTotal ?? 0)} requested`}
              tone={(data?.pendingRefundRequestCount ?? 0) > 0 ? 'amber' : 'slate'}
            />
            <StatCard
              label="Withdrawals unconfirmed"
              value={String(data?.unconfirmedWithdrawalCount ?? 0)}
              sub={`${formatCurrency(data?.unconfirmedWithdrawalTotal ?? 0)} not confirmed received`}
              tone={(data?.unconfirmedWithdrawalCount ?? 0) > 0 ? 'amber' : 'slate'}
            />
          </div>

          {/* Where to resolve each of the above */}
          <div className="admin-card p-4 space-y-2">
            <p className="text-sm font-semibold text-slate-700">Where to clear these</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/finance/topups" className="btn-secondary text-xs"><ExternalLink className="w-3.5 h-3.5" /> Top-ups queue</Link>
              <Link href="/transactions/refunds" className="btn-secondary text-xs"><ExternalLink className="w-3.5 h-3.5" /> Refund requests</Link>
              <Link href="/finance/accounts" className="btn-secondary text-xs"><ExternalLink className="w-3.5 h-3.5" /> Withdrawal log</Link>
              <Link href="/preorders/orders" className="btn-secondary text-xs"><ExternalLink className="w-3.5 h-3.5" /> Preorders (by date)</Link>
              <Link href="/settings/cashiers" className="btn-secondary text-xs"><ExternalLink className="w-3.5 h-3.5" /> Cashiers (tips)</Link>
            </div>
          </div>

          {/* Unpaid cashier tips — money owed to staff that has no queue or
              badge anywhere else in the app prompting anyone to settle it. */}
          {(data?.unpaidTips.length ?? 0) > 0 && (
            <div className="admin-card p-4 space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-slate-700">Cashier tips never paid out</p>
                <span className="text-lg font-bold text-amber-600">{formatCurrency(data?.unpaidTipsTotal ?? 0)}</span>
              </div>
              <p className="text-xs text-slate-400 -mt-1 max-w-2xl">
                Tips accumulated at checkout for cashiers with no linked student account. This is real money owed to staff before they leave — pay it out from Settings → Cashiers, which credits their linked account or logs a cash payout to the withdrawal log.
              </p>
              <ul className="divide-y divide-slate-50">
                {data?.unpaidTips.map(t => (
                  <li key={t.id} className="flex items-center justify-between py-2">
                    <span className="text-sm text-slate-700">{t.name}</span>
                    <span className="text-sm font-semibold text-slate-900">{formatCurrency(t.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Vendor */}
          <div className="admin-card p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <Truck className="w-4 h-4 text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Still owed to the preorder vendor</p>
                <p className="text-xs text-slate-400 mt-0.5 max-w-xl">
                  {formatCurrency(vendor?.owed ?? 0)} accrued minus {formatCurrency(vendor?.paid ?? 0)} paid. Accruing {vendor?.accrualMode === 'on_send' ? 'when a day\'s order is sent to the vendor' : 'only once each order is confirmed received'}. A vendor item with no cost price set silently adds nothing to this figure.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`text-xl font-bold ${(vendor?.balance ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {formatCurrency(vendor?.balance ?? 0)}
              </span>
              <Link href="/preorders/vendor" className="btn-secondary text-sm">
                <ExternalLink className="w-4 h-4" /> Vendor ledger
              </Link>
            </div>
          </div>

          {/* Pending preorders across all dates — the Preorders hub can only
              ever show one date at a time, so this is the only place a
              forgotten order from three weeks ago is visible. */}
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Pending preorders — every date</h2>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl">
                A pending preorder has <span className="font-medium">never charged anyone</span> — the balance is only taken when someone taps Confirm Received. Past-dated ones were either handed over and never confirmed (student was never charged) or never handed over at all (you may still owe the vendor for it). Confirm or cancel each from the Preorders hub, picking that date.
              </p>
            </div>

            {pending.length === 0 ? (
              <div className="admin-card p-8 text-center text-sm text-slate-400">
                Nothing pending — every preorder has been confirmed or cancelled.
              </div>
            ) : (
              <div className="admin-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px]">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">For Date</th>
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Name</th>
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Items</th>
                        <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Vendor</th>
                        <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Uncharged</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {[...stale, ...upcoming].map(p => (
                        <tr key={p.id} className={`table-row ${p.isStale ? 'bg-amber-50/40' : ''}`}>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              {p.isStale && <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                              <span className={`text-sm ${p.isStale ? 'font-semibold text-amber-700' : 'text-slate-600'}`}>
                                {format(new Date(p.forDate + 'T12:00:00'), 'MMM d, yyyy')}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-semibold text-slate-900">{p.bochurName}</span>
                            {p.isStaffPricing && <span className="ml-1.5 badge bg-purple-50 text-purple-700 border border-purple-100">Staff</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">{p.itemSummary || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            {p.sentToVendor ? (
                              <span className="badge bg-slate-100 text-slate-600 border border-slate-200">Sent</span>
                            ) : (
                              <span className="text-slate-300 text-sm">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-slate-900 text-right">{formatCurrency(p.total)}</td>
                          <td className="px-4 py-3 text-right">
                            <Link href="/preorders/orders" className="text-xs font-semibold text-amber-600 hover:text-amber-700 whitespace-nowrap">
                              Open →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* Ordering warning — the one sequencing trap in the whole wind-down */}
          <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
            <Wallet className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              <span className="font-semibold">Order of operations matters.</span> Clear these loose ends <span className="font-semibold">before</span> refunding any balances. Confirming a preorder, approving a pending top-up, or approving a refund request all move a student&apos;s balance — so a balance you refunded yesterday can be wrong by this afternoon, and a confirm on an already-emptied account will simply fail for insufficient funds.
            </span>
          </div>
        </>
      )}
    </div>
  )
}
