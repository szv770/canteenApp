'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { isBeforeCutoff, localDateStrInTz } from '@/lib/preorderCutoff'

// Lightweight month-grid date picker shared by the public Preorders link
// (app/preorder/page.tsx) and the POS Preorder modal (components/pos/*).
// No calendar library is installed — this is deliberately a small, from-scratch
// component (see CLAUDE.md Preorders task notes). All open/closed-day logic
// is delegated to isBeforeCutoff() from lib/preorderCutoff.ts — a day is
// selectable exactly when isBeforeCutoff(dateStr, cutoffTime) is true. This
// single check naturally also greys out past dates: a past date's cutoff
// deadline (the evening before it) is also in the past, so isBeforeCutoff
// already returns false for it without any separate "is this in the past"
// branch. Do not duplicate/reinvent that date math here.

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const ACCENT = {
  amber: {
    selected: 'bg-amber-500 text-white hover:bg-amber-500',
    today: 'ring-2 ring-amber-400 ring-inset',
    hover: 'hover:bg-amber-50 text-slate-700',
    nav: 'text-slate-500 hover:bg-slate-100',
    label: 'text-slate-700',
  },
  teal: {
    selected: 'bg-teal-600 text-white hover:bg-teal-600',
    today: 'ring-2 ring-teal-400 ring-inset',
    hover: 'hover:bg-teal-50 text-stone-700',
    nav: 'text-stone-500 hover:bg-stone-100',
    label: 'text-stone-700',
  },
} as const

interface PreorderCalendarProps {
  cutoffTime: string
  selected: string // YYYY-MM-DD, '' if none chosen yet
  onSelect: (date: string) => void
  accent?: keyof typeof ACCENT
  monthsAhead?: number // how many months forward the user may navigate
}

export default function PreorderCalendar({
  cutoffTime,
  selected,
  onSelect,
  accent = 'amber',
  monthsAhead = 3,
}: PreorderCalendarProps) {
  const now = new Date()
  const todayStr = localDateStrInTz(now)
  const [todayY, todayM] = todayStr.split('-').map(Number)

  const [viewYear, setViewYear] = useState(todayY)
  const [viewMonth, setViewMonth] = useState(todayM) // 1-indexed

  const colors = ACCENT[accent]
  const pad = (n: number) => String(n).padStart(2, '0')

  const firstOfMonth = new Date(viewYear, viewMonth - 1, 1)
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate()
  const startWeekday = firstOfMonth.getDay() // 0=Sun
  const monthLabel = firstOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const atEarliestMonth = viewYear === todayY && viewMonth === todayM
  const maxMonthsOut = new Date(todayY, todayM - 1 + monthsAhead, 1)
  const atLatestMonth = viewYear === maxMonthsOut.getFullYear() && viewMonth === maxMonthsOut.getMonth() + 1

  function goPrev() {
    if (atEarliestMonth) return
    let m = viewMonth - 1, y = viewYear
    if (m < 1) { m = 12; y -= 1 }
    setViewMonth(m); setViewYear(y)
  }
  function goNext() {
    if (atLatestMonth) return
    let m = viewMonth + 1, y = viewYear
    if (m > 12) { m = 1; y += 1 }
    setViewMonth(m); setViewYear(y)
  }

  const cells: (string | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${viewYear}-${pad(viewMonth)}-${pad(d)}`)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={goPrev}
          disabled={atEarliestMonth}
          aria-label="Previous month"
          className={`p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${colors.nav}`}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className={`text-sm font-semibold ${colors.label}`}>{monthLabel}</span>
        <button
          type="button"
          onClick={goNext}
          disabled={atLatestMonth}
          aria-label="Next month"
          className={`p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${colors.nav}`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={i} className="text-center text-[11px] font-semibold text-slate-400 uppercase">{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={`blank-${i}`} />
          const openable = isBeforeCutoff(dateStr, cutoffTime, now)
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selected
          const dayNum = Number(dateStr.split('-')[2])
          return (
            <button
              key={dateStr}
              type="button"
              disabled={!openable}
              onClick={() => onSelect(dateStr)}
              className={`aspect-square min-h-[44px] flex items-center justify-center rounded-xl text-sm font-medium transition-colors
                ${!openable ? 'text-slate-300 cursor-not-allowed' : isSelected ? colors.selected : colors.hover}
                ${isToday && !isSelected ? colors.today : ''}
              `}
            >
              {dayNum}
            </button>
          )
        })}
      </div>
    </div>
  )
}
