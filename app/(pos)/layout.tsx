import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('cashier_profiles')
    .select('is_active')
    .eq('id', user.id)
    .single()
  if (!profile || !profile.is_active) redirect('/login')

  return <>{children}</>
}
