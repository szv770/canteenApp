'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { cutoffDeadlineForDate } from '@/lib/preorderCutoff'

// Live "ordering closes in Xh Ym" for whichever date is currently selected.
// All deadline math is delegated to lib/preorderCutoff.ts — never reimplement
// it here (camp-local, same-day-aware; see CLAUDE.md gotchas #34/#41).
interface Props {
  forDate: string
  cutoffTime: string
  sameDayCutoffTime?: string
  accent?: 'amber' | 'teal'
}

export default function PreorderCutoffCountdown({ forDate, cutoffTime, sameDayCutoffTime, accent = 'amber' }: Props) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])

  if (!forDate) return null

  const deadline = cutoffDeadlineForDate(forDate, cutoffTime, undefined, now, sameDayCutoffTime)
  const msLeft = deadline.getTime() - now.getTime()

  const tone = accent === 'teal' ? 'text-teal-700' : 'text-amber-700'

  if (msLeft <= 0) {
    return (
      <p className="text-xs text-red-500 flex items-center gap-1 mt-1.5">
        <Clock className="w-3 h-3" /> Ordering for this date has closed.
      </p>
    )
  }

  const totalMinutes = Math.floor(msLeft / 60000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  const left = days > 0
    ? `${days}d ${hours}h`
    : hours > 0
      ? `${hours}h ${minutes}m`
      : `${minutes}m`

  const urgent = msLeft < 60 * 60 * 1000

  return (
    <p className={`text-xs flex items-center gap-1 mt-1.5 ${urgent ? 'text-red-600 font-semibold' : tone}`}>
      <Clock className="w-3 h-3" /> Ordering closes in {left}
    </p>
  )
}
