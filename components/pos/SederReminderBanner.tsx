'use client'

import { Clock, X } from 'lucide-react'

interface Props {
  sederName: string
  minutesUntil: number
  onDismiss: () => void
}

export default function SederReminderBanner({ sederName, minutesUntil, onDismiss }: Props) {
  return (
    <div className="shrink-0 z-20 flex items-center gap-3 px-4 py-2.5 bg-amber-50 border-b-2 border-amber-300">
      <Clock className="w-4.5 h-4.5 text-amber-600 shrink-0" />
      <p className="flex-1 text-sm font-semibold text-amber-800">
        {sederName} starts in {minutesUntil} minute{minutesUntil === 1 ? '' : 's'} — start wrapping up
      </p>
      <button
        onClick={onDismiss}
        className="shrink-0 p-1 rounded-lg text-amber-500 hover:bg-amber-100 hover:text-amber-700 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
