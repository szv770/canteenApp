'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import TopupsPage from '../../topups/page'
import AccountsPage from '../../accounts/page'
import CogsPage from '../../cogs/page'

type FinanceTab = 'topups' | 'accounts' | 'cogs'

const TABS: { key: FinanceTab; label: string }[] = [
  { key: 'topups', label: 'Top-ups' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'cogs', label: 'COGS & Expenses' },
]

export default function FinancePage() {
  const params = useParams<{ tab: string }>()
  const VALID_TABS: FinanceTab[] = ['topups', 'accounts', 'cogs']
  const tab: FinanceTab = VALID_TABS.includes(params.tab as FinanceTab) ? (params.tab as FinanceTab) : 'topups'

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 px-4 sm:px-6 pt-4 sm:pt-6 border-b border-slate-200 bg-white sticky top-0 z-10">
        {TABS.map(t => (
          <Link
            key={t.key}
            href={`/finance/${t.key}`}
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

      {/* Tab content */}
      {tab === 'topups' && <TopupsPage />}
      {tab === 'accounts' && <AccountsPage />}
      {tab === 'cogs' && <CogsPage />}
    </div>
  )
}
