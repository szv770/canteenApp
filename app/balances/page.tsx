'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ProgramBalancesView from '@/components/admin/ProgramBalancesView'

export default function BalancesPage() {
  const supabase = createClient()
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'denied' | 'allowed'>('loading')

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'cashier_view_program_settlements_enabled')
        .single()
      setStatus(data?.value === 'true' ? 'allowed' : 'denied')
    }
    check()
  }, [])

  const BackButton = (
    <button
      onClick={() => router.push('/pos')}
      className="p-2 rounded-xl hover:bg-slate-100 transition-colors"
    >
      <ArrowLeft className="w-5 h-5 text-slate-600" />
    </button>
  )

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (status === 'denied') {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
          {BackButton}
          <div className="flex-1">
            <h1 className="font-bold text-slate-900">End of Program Balances</h1>
          </div>
        </div>
        <div className="max-w-lg mx-auto p-4">
          <div className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm text-center">
            <p className="text-sm text-slate-500">
              This view isn't turned on right now — ask an admin to enable it in Settings.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        {BackButton}
        <div className="flex-1">
          <h1 className="font-bold text-slate-900">End of Program Balances</h1>
          <p className="text-xs text-slate-400">View only — see an admin to settle a balance</p>
        </div>
      </div>

      {/* No max-w wrapper here — ProgramBalancesView manages its own
          max-w-5xl two-column layout internally; constraining it to
          cashier-dashboard's narrower max-w-lg would squeeze the
          Owed-to-Families / Owed-to-Canteen grid on anything wider than a
          phone, which matters on a kiosk-sized screen. */}
      <ProgramBalancesView mode="readonly" />
    </div>
  )
}
