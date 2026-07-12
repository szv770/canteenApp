'use client'

import { useState } from 'react'
import TopupsPage from '../topups/page'
import AccountsPage from '../accounts/page'
import CogsPage from '../cogs/page'

type FinanceTab = 'topups' | 'accounts' | 'cogs'

const TABS: { key: FinanceTab; label: string }[] = [
  { key: 'topups', label: 'Top-ups' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'cogs', label: 'COGS & Expenses' },
]

export default function FinancePage() {
  const [tab, setTab] = useState<FinanceTab>('topups')

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 px-4 sm:px-6 pt-4 sm:pt-6 border-b border-slate-200 bg-white sticky top-0 z-10">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold -mb-px border-b-2 transition-colors ${
              tab === t.key
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'topups' && <TopupsPage />}
      {tab === 'accounts' && <AccountsPage />}
      {tab === 'cogs' && <CogsPage />}
    </div>
  )
}
