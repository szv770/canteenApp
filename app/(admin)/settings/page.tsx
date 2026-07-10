'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Save, Upload, FileText } from 'lucide-react'
import toast from 'react-hot-toast'

interface SettingRow {
  key: string
  label: string
  description: string
  type: 'toggle' | 'number' | 'select' | 'text' | 'textarea'
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
  { key: 'daily_revenue_target', label: 'Daily Revenue Target ($)', description: 'Target daily revenue shown as a progress gauge on the dashboard', type: 'number' },
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
  { key: 'payment_cashapp_enabled', label: 'Cash App', description: 'Show Cash App as a payment option for parents', type: 'toggle' },
  { key: 'payment_cashapp_info', label: 'Cash App $Cashtag', description: 'e.g. $YeshivaCanteen', type: 'text' },
  { key: 'payment_cash_enabled', label: 'Cash / Check', description: 'Show bring-cash option on the parent page', type: 'toggle' },
]

const CC_PAYMENT_SETTINGS: SettingRow[] = [
  { key: 'payment_cc_enabled', label: 'Credit Card (Online)', description: 'Show an online credit card top-up option for parents', type: 'toggle' },
  { key: 'payment_cc_link', label: 'Payment Link', description: 'Your Stripe (or other) payment link parents are sent to. https:// is added automatically if you leave it off', type: 'text' },
  { key: 'payment_cc_prefill_enabled', label: 'Append Amount / Name to Link', description: 'Add query params to the link with the amount and student name entered in the form', type: 'toggle' },
  { key: 'payment_cc_amount_param', label: 'Amount Param Name', description: 'Query param name for the amount, e.g. prefilled_amount', type: 'text' },
  { key: 'payment_cc_name_param', label: 'Name Param Name', description: 'Query param name for the student name, e.g. client_reference_id', type: 'text' },
  { key: 'payment_cc_coming_soon_enabled', label: 'Show "Coming Soon" Announcement', description: 'Only used while Credit Card (Online) above is off and no Payment Link is set — shows a greyed-out "coming soon" card instead of hiding it entirely', type: 'toggle' },
]

const TOP_SELLERS_SETTINGS: SettingRow[] = [
  { key: 'top_sellers_mode', label: 'Mode', description: 'How the "Popular right now" list on the home page is filled', type: 'select', options: [
    { value: 'manual', label: 'Manual — I type the list' },
    { value: 'auto', label: 'Auto — pull from recent sales' },
  ]},
  { key: 'top_sellers_manual', label: 'Manual List', description: 'One item per line, up to 5 (used when Mode is Manual)', type: 'textarea' },
]

const NINE_DAYS_SETTINGS: SettingRow[] = [
  { key: 'nine_days_blurb', label: 'Blurb', description: "Short note about Nine Days alternatives, shown on the home page", type: 'textarea' },
]

const EMAIL_IDENTITY_SETTINGS: SettingRow[] = [
  { key: 'email_sender_name', label: 'Sender Name', description: 'Name parents see in the "From" field, e.g. Miami Mesivta Canteen', type: 'text' },
  { key: 'email_sender_address', label: 'Sender Address', description: 'Must be a verified domain in your Resend account, e.g. canteen@miamimesivta.com', type: 'text' },
  { key: 'email_reply_to', label: 'Reply-To Address', description: 'Where replies from parents go', type: 'text' },
  { key: 'email_footer_note', label: 'Footer Note', description: 'Text shown at the bottom of every email, e.g. "Questions? Call us at 305-555-1234"', type: 'textarea' },
]

const EMAIL_RECEIVED_SETTINGS: SettingRow[] = [
  { key: 'email_topup_received_enabled', label: 'Send Confirmation Email', description: 'Email parent when their top-up request is received', type: 'toggle' },
  { key: 'email_topup_received_subject', label: 'Subject Line', description: 'Use {amount} and {student} as placeholders', type: 'text' },
  { key: 'email_topup_received_note', label: 'Extra Message', description: 'Optional paragraph appended to the confirmation email body', type: 'textarea' },
]

const EMAIL_APPROVED_SETTINGS: SettingRow[] = [
  { key: 'email_topup_approved_enabled', label: 'Send Approval Email', description: 'Email parent when their top-up is confirmed by a cashier', type: 'toggle' },
  { key: 'email_topup_approved_subject', label: 'Subject Line', description: 'Use {amount} and {student} as placeholders', type: 'text' },
  { key: 'email_topup_approved_note', label: 'Extra Message', description: 'Optional extra line in the approval email, e.g. "Funds are available immediately"', type: 'textarea' },
]

const EMAIL_REJECTED_SETTINGS: SettingRow[] = [
  { key: 'email_topup_rejected_enabled', label: 'Send Rejection Email', description: 'Email parent when their top-up request is rejected', type: 'toggle' },
  { key: 'email_topup_rejected_subject', label: 'Subject Line', description: 'Use {amount} and {student} as placeholders', type: 'text' },
  { key: 'email_topup_rejected_note', label: 'Default Rejection Note', description: 'Pre-filled reason shown in rejection emails when no specific reason is given', type: 'textarea' },
]

function SettingControl({ s, settings, set }: { s: SettingRow; settings: Record<string, string>; set: (k: string, v: string) => void }) {
  const isToggle = s.type === 'toggle'
  const isTextarea = s.type === 'textarea'
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
        {isTextarea && (
          <textarea rows={4} className="input-admin w-full resize-none" value={settings[s.key] || ''} onChange={e => set(s.key, e.target.value)} />
        )}
      </div>
    </div>
  )
}

function NineDaysFlyerUpload({ settings, set }: { settings: Record<string, string>; set: (k: string, v: string) => void }) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const fileUrl = settings['nine_days_file_url'] || ''

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'png'
      const filename = `nine-days-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('site-assets')
        .upload(filename, file, { upsert: true })
      if (uploadError) {
        toast.error(`Upload failed: ${uploadError.message}`)
        return
      }
      const { data: urlData } = supabase.storage.from('site-assets').getPublicUrl(filename)
      set('nine_days_file_url', urlData.publicUrl)
      toast.success('Flyer uploaded')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="admin-card p-4 space-y-2">
      <p className="text-sm font-semibold text-gray-900">Flyer (image or PDF)</p>
      <p className="text-xs text-gray-400 mt-0.5">Optional — shown as a link/thumbnail below the blurb</p>
      <div className="flex items-center gap-3 pt-1">
        {fileUrl && (
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-brand hover:underline">
            <FileText className="w-4 h-4" /> View current flyer
          </a>
        )}
        <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleUpload} />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-secondary text-sm flex items-center gap-1.5">
          <Upload className="w-3.5 h-3.5" /> {uploading ? 'Uploading...' : fileUrl ? 'Replace' : 'Upload Flyer'}
        </button>
        {fileUrl && (
          <button type="button" onClick={() => set('nine_days_file_url', '')} className="text-sm text-red-500 hover:text-red-600 font-medium">
            Remove
          </button>
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

  const ALL_CONFIG = [...SETTINGS_CONFIG, ...PAYMENT_SETTINGS, ...CC_PAYMENT_SETTINGS, ...TOP_SELLERS_SETTINGS, ...NINE_DAYS_SETTINGS, ...EMAIL_IDENTITY_SETTINGS, ...EMAIL_RECEIVED_SETTINGS, ...EMAIL_APPROVED_SETTINGS, ...EMAIL_REJECTED_SETTINGS]

  function parseSettingValue(key: string, raw: string): unknown {
    const config = ALL_CONFIG.find(s => s.key === key)
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

        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Online Credit Card Top-up</h2>
          <p className="text-xs text-gray-400 mb-3">
            Parents see a no-refunds warning before being sent to this link. We eat a processing fee even on refunds, so encourage smaller initial charges.
          </p>
          <div className="space-y-3">
            {CC_PAYMENT_SETTINGS.map(s => <SettingControl key={s.key} s={s} settings={settings} set={set} />)}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Popular Items (Home Page)</h2>
          <div className="space-y-3">
            {TOP_SELLERS_SETTINGS.map(s => <SettingControl key={s.key} s={s} settings={settings} set={set} />)}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Nine Days Menu</h2>
          <div className="space-y-3">
            {NINE_DAYS_SETTINGS.map(s => <SettingControl key={s.key} s={s} settings={settings} set={set} />)}
            <NineDaysFlyerUpload settings={settings} set={set} />
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">✉️ Email — Identity</h2>
          <p className="text-xs text-gray-400 mb-3">
            These apply to all emails sent to parents. The sender address must be verified in your Resend account.
          </p>
          <div className="space-y-3">
            {EMAIL_IDENTITY_SETTINGS.map(s => <SettingControl key={s.key} s={s} settings={settings} set={set} />)}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">✉️ Email — Request Received</h2>
          <p className="text-xs text-gray-400 mb-3">
            Sent automatically when a parent submits a top-up request on the home page.
          </p>
          <div className="space-y-3">
            {EMAIL_RECEIVED_SETTINGS.map(s => <SettingControl key={s.key} s={s} settings={settings} set={set} />)}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">✉️ Email — Top-up Approved</h2>
          <p className="text-xs text-gray-400 mb-3">
            Sent when a cashier confirms the top-up and credits the student's balance.
          </p>
          <div className="space-y-3">
            {EMAIL_APPROVED_SETTINGS.map(s => <SettingControl key={s.key} s={s} settings={settings} set={set} />)}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">✉️ Email — Top-up Rejected</h2>
          <p className="text-xs text-gray-400 mb-3">
            Sent when a cashier rejects the request. The cashier can type a specific reason at rejection time which overrides the default note below.
          </p>
          <div className="space-y-3">
            {EMAIL_REJECTED_SETTINGS.map(s => <SettingControl key={s.key} s={s} settings={settings} set={set} />)}
          </div>
        </section>
      </div>
    </div>
  )
}
