import { createClient } from '@/lib/supabase/server'
import LandingClient from './LandingClient'
import { getAutoTopSellers, getHomeAnnouncement, TopSellerItem } from '@/lib/home'

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

  const announcement = await getHomeAnnouncement()

  let topSellers: TopSellerItem[] = []
  if (settings['top_sellers_mode'] === 'auto') {
    topSellers = await getAutoTopSellers()
  } else {
    topSellers = (settings['top_sellers_manual'] || '')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 5)
      .map(name => ({ name, icon: null }))
  }

  return (
    <LandingClient
      loggedIn={!!user}
      settings={settings}
      announcement={announcement}
      topSellers={topSellers}
    />
  )
}
