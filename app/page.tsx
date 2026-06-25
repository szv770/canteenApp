import { createClient } from '@/lib/supabase/server'
import LandingClient from './LandingClient'

export default async function HomePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: settingsRows } = await supabase.from('settings').select('key,value')
  const settings: Record<string, string> = {}
  ;(settingsRows || []).forEach((s: any) => {
    const raw = String(s.value)
    // strip JSON string quotes from string values
    settings[s.key] = raw.startsWith('"') ? raw.slice(1, -1) : raw
  })

  return <LandingClient loggedIn={!!user} settings={settings} />
}
