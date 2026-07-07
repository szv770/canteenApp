'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Save } from 'lucide-react'
import toast from 'react-hot-toast'

interface SettingRow {
  key: string
  label: string
  description: string
  type: 'toggle' | 'number' | 'select' | 'text'
  options?: { value: string; label: string }[]
}

const SETTINGS_CONFIG: SettingRow[] = [
  { key: 'coin_rounding', label: 'Coin Rounding', description: 'Round cash totals up to nearest $0.05 (no pennies)', type: 'toggle' },
  { key: 'allow_negative_balance', label: 'Allow Negative Balance', description: 'Let bochurim go below $0 by default', type: 'toggle' },
  { key: 'max_negative_balance', label: 'Max Negative Balance ($)', description: 'Maximum amount a bochur can owe', type: 'number' },
  { key: 'out_of_stock_behavior', label: 'Out of Stock Behavior', description: 'What happens when a product runs out', type: 'select', options: [
    { value: 'warn', label: 'Show warning' },
    { value: 'hide', label: 'Hide product' },
    { value: 'block', label: 'Block purchase' },
  ]},
  { key: 'cc_fee_percent', label: 'Credit Card Fee (%)', description: 'Processing fee % added to CC payments', type: 'number' },
  { key: 'tax_rate', label: 'Tax Rate (%)', description: 'Sales tax percentage (0 for no tax)', type: 'number' },
  { key: 'stripe_enabled', label: 'Stripe Payments', description: 'Enable Stripe Terminal card reader', type: 'toggle' },
  { key: 'offline_mode_enabled', label: 'Offline Mode', description: 'Allow POS to work without internet', type: 'toggle' },
  { key: 'offline_freeze_hours', label: 'Offline Freeze (hours)', description: 'Auto-freeze POS after X hours offline', type: 'number' },
  { key: 'tip_routing', label: 'Tip Routing', description: 'Where cashier tips go after checkout', type: 'select', options: [
    { value: 'cashier_balance', label: "Add to cashier's canteen balance" },
    { value: 'revenue', label: 'Track as revenue only' },
  ]},
]

const PAYMENT_SETTINGS: SettingRow[] = [
  { key: 'canteen_name', label: 'Canteen Name', description: 'Shown on the parent landing page', type: 'text' },
  { key: 'canteen_tagline', label: 'Tagline', description: 'Subtitle shown below the canteen name', type: 'text' },
  { key: 'payment_zelle_enabled', label: 'Zelle', description: 'Show Zelle as a payment option for parents', type: 'toggle' },
  { key: 'payment_zelle_info', label: 'Zelle Handle / Phone', description: 'The Zelle phone number or email parents send to', type: 'text' },
  { key: 'payment_venmo_enabled', label: 'Venmo', description: 'Show Venmo as a payment option for parents', type: 'toggle' },
  { key: 'payment_venmo_info', label: 'Venmo Handle', description: 'e.g. @YeshivaCanteen', type: 'text' },
  { key: 'payment_paypal_enabled', label: 'PayPal', description: 'Show PayPal as a payment option for parents', type: 'toggle' },
  { key: 'payment_paypal_info', label: 'PayPal Link / Email', description: 'PayPal.me link or email address', type: 'text' },
  { key: 'payment_cash_enabled', label: 'Cash / Check', description: 'Show bring-cash option on the parent page', type: 'toggle' },
]

function SettingControl({ s, settings, set }: { s: SettingRow; settings: Record<string, string>; set: (k: string, v: string) => void }) {
  const isToggle = s.type === 'toggle'
  return (
    <div className={`admin-card p-4 ${isToggle ? 'flex items-start justify-between gap-4' : 'space-y-2'}`}>
      <div className={isToggle ? 'flex-1 min-w-0' : ''}>
        <p className="text-sm font-semibold text-gray-900">{s.label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{s.description}</p>
      </div>
      <div className={isToggle ? 'shrink-0' : 'w-full'}>
        {s.type === 'toggle' && (
          <button
            onClick={() => set(s.key, settings[s.key] === 'true' ? 'false' : 'true')}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${settings[s.key] === 'true' ? 'bg-brand' : 'bg-gray-200'}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm ${settings[s.key] === 'true' ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        )}
        {s.type === 'number' && (
          <input type="number" inputMode="decimal" className="input-admin w-full sm:w-32 text-right" value={settings[s.key] || ''} onChange={e => set(s.key, e.target.value)} step={0.1} min={0} />
        )}
        {s.type === 'select' && (
          <select className="input-admin w-full sm:w-48" value={settings[s.key] || ''} onChange={e => set(s.key, e.target.value)}>
            {s.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        {s.type === 'text' && (
          <input type="text" className="input-admin w-full" value={settings[s.key] || ''} onChange={e => set(s.key, e.target.value)} />
        )}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const supabase = createClient()
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('settings').select('*').then(({ data, error }) => {
      if (error) {
        toast.error(`Failed to load settings: ${error.message}`)
      } else if (data) {
        const map: Record<string, string> = {}
        data.forEach((s: any) => { map[s.key] = s.value == null ? '' : String(s.value) })
        setSettings(map)
      }
      setLoading(false)
    })
  }, [])

  function parseSettingValue(key: string, raw: string): unknown {
    const config = [...SETTINGS_CONFIG, ...PAYMENT_SETTINGS].find(s => s.key === key)
    if (!config) return raw
    if (config.type === 'toggle') return raw === 'true'
    if (config.type === 'number') return raw === '' ? null : Number(raw)
    return raw
  }

  async function saveAll() {
    setSaving(true)
    const rows = Object.entries(settings).map(([key, value]) => ({
      key, value: parseSettingValue(key, value), updated_at: new Date().toISOString()
    }))
    const { error } = await supabase.from('settings').upsert(rows, { onConflict: 'key' })
    if (error) toast.error(error.message)
    else toast.success('Settings saved!')
    setSaving(false)
  }

  function set(key: string, value: string) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  if (loading) return <div className="p-6 text-gray-400">Loading settings...</div>

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500 text-sm mt-1">Configure POS behavior</p>
        </div>
        <button onClick={saveAll} disabled={saving} className="btn-primary text-sm">
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save All'}
        </button>
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">POS Behavior</h2>
          <div className="space-y-3">
            {SETTINGS_CONFIG.map(s => <SettingControl key={s.key} s={s} settings={settings} set={set} />)}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Parent Payment Portal</h2>
          <p className="text-xs text-gray-400 mb-3">
            These appear on the public landing page at <span className="font-mono bg-gray-100 px-1 rounded">canteen.szvtech.org</span> so parents know where to send money.
          </p>
          <div className="space-y-3">
            {PAYMENT_SETTINGS.map(s => <SettingControl key={s.key} s={s} settings={settings} set={set} />)}
          </div>
        </section>
      </div>
    </div>
  )
}
