'use client'

import { AlertOctagon } from 'lucide-react'

interface Props {
  sederName: string
  endTime: string
  onOrderAnyway: () => void
}

function timeLabel(t: string) {
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

export default function SederNowOverlay({ sederName, endTime, onOrderAnyway }: Props) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center animate-scale-in">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-50 flex items-center justify-center">
          <AlertOctagon className="w-9 h-9 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Seder Now</h2>
        <p className="text-sm text-slate-500 mb-1">
          <span className="font-semibold text-slate-700">{sederName}</span> is in session
        </p>
        <p className="text-sm text-slate-500 mb-6">
          The canteen should not be open right now. It runs until {timeLabel(endTime)}.
        </p>
        <button
          onClick={onOrderAnyway}
          className="w-full py-3 rounded-xl border-2 border-slate-200 text-slate-500 font-medium text-sm hover:bg-slate-50 transition-colors"
        >
          I understand — order anyway
        </button>
      </div>
    </div>
  )
}
