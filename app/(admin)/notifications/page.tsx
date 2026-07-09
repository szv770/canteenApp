'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, Send, AlertTriangle, Info, Zap, Eye, EyeOff, Home } from 'lucide-react'

type NotifType = 'info' | 'warning' | 'urgent'

interface CashierNotification {
  id: string
  message: string
  type: NotifType
  is_active: boolean
  expires_at: string | null
  created_by: string | null
  created_at: string
  show_on_home_page: boolean
}

function TypeBadge({ type }: { type: NotifType }) {
  if (type === 'urgent') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-red-100 text-red-700">
        <Zap className="w-3 h-3" />Urgent
      </span>
    )
  }
  if (type === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-700">
        <AlertTriangle className="w-3 h-3" />Warning
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-blue-100 text-blue-700">
      <Info className="w-3 h-3" />Info
    </span>
  )
}

function nowLocal() {
  const d = new Date()
  d.setSeconds(0, 0)
  return d.toISOString().slice(0, 16)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function NotificationsPage() {
  const supabase = createClient()
  const [notifications, setNotifications] = useState<CashierNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deactivating, setDeactivating] = useState<string | null>(null)

  // Form state
  const [message, setMessage] = useState('')
  const [type, setType] = useState<NotifType>('info')
  const [noExpiry, setNoExpiry] = useState(true)
  const [expiryValue, setExpiryValue] = useState('')
  const [showOnHomePage, setShowOnHomePage] = useState(false)

  useEffect(() => {
    loadNotifications()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive])

  async function loadNotifications() {
    setLoading(true)
    let query = supabase
      .from('cashier_notifications')
      .select('*')
      .order('created_at', { ascending: false })
    if (!showInactive) {
      query = query.eq('is_active', true)
    }
    const { data } = await query
    setNotifications(data ?? [])
    setLoading(false)
  }

  async function handleSend() {
    if (!message.trim()) return
    if (!noExpiry && !expiryValue) return
    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('cashier_notifications').insert({
        message: message.trim(),
        type,
        is_active: true,
        expires_at: noExpiry ? null : new Date(expiryValue).toISOString(),
        created_by: user?.id ?? null,
        show_on_home_page: showOnHomePage,
      })
      if (!error) {
        setMessage('')
        setType('info')
        setNoExpiry(true)
        setExpiryValue('')
        setShowOnHomePage(false)
        await loadNotifications()
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeactivate(id: string) {
    setDeactivating(id)
    await supabase
      .from('cashier_notifications')
      .update({ is_active: false })
      .eq('id', id)
    if (showInactive) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_active: false } : n))
    } else {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }
    setDeactivating(null)
  }

  const typeButtons: Array<{ value: NotifType; label: string; active: string; inactive: string }> = [
    {
      value: 'info',
      label: 'Info',
      active: 'bg-blue-50 border-blue-300 text-blue-700',
      inactive: 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700',
    },
    {
      value: 'warning',
      label: 'Warning',
      active: 'bg-amber-50 border-amber-300 text-amber-700',
      inactive: 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700',
    },
    {
      value: 'urgent',
      label: 'Urgent',
      active: 'bg-red-50 border-red-300 text-red-700',
      inactive: 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700',
    },
  ]

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shadow-sm">
          <Bell className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Notifications</h1>
          <p className="text-sm text-slate-500">Send messages to cashier terminals in real-time</p>
        </div>
      </div>

      {/* Compose form */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <h2 className="font-semibold text-slate-800">Compose Notification</h2>

        {/* Message */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Message</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Enter notification message for cashiers..."
            rows={3}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all text-sm resize-none"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          {/* Type selector */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Type</label>
            <div className="flex gap-2">
              {typeButtons.map(btn => (
                <button
                  key={btn.value}
                  onClick={() => setType(btn.value)}
                  className={`flex-1 py-2 px-2 rounded-xl border text-sm font-medium transition-all ${
                    type === btn.value ? btn.active : btn.inactive
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              {type === 'info' && 'Standard informational message.'}
              {type === 'warning' && 'Amber toast — stays 6 seconds.'}
              {type === 'urgent' && 'Red toast — stays until cashier dismisses it.'}
            </p>
          </div>

          {/* Expiry */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Expiry</label>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={noExpiry}
                onChange={e => setNoExpiry(e.target.checked)}
                className="rounded border-slate-300 text-amber-500 focus:ring-amber-400"
              />
              <span className="text-sm text-slate-600">No expiry</span>
            </label>
            {!noExpiry && (
              <input
                type="datetime-local"
                value={expiryValue}
                min={nowLocal()}
                onChange={e => setExpiryValue(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all"
              />
            )}
          </div>
        </div>

        <label className="flex items-start gap-2 cursor-pointer bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <input
            type="checkbox"
            checked={showOnHomePage}
            onChange={e => setShowOnHomePage(e.target.checked)}
            className="mt-0.5 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium">Also show on parent home page</span>
            <span className="block text-xs text-slate-500 mt-0.5">
              Displayed as an ever-present banner (parents can dismiss it) instead of a cashier popup toast.
            </span>
          </span>
        </label>

        <button
          onClick={handleSend}
          disabled={submitting || !message.trim() || (!noExpiry && !expiryValue)}
          className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-amber-500/20"
        >
          <Send className="w-4 h-4" />
          {submitting ? 'Sending...' : 'Send Notification'}
        </button>
      </div>

      {/* Notifications table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">
            {showInactive ? 'All Notifications' : 'Active Notifications'}
          </h2>
          <button
            onClick={() => setShowInactive(v => !v)}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            {showInactive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showInactive ? 'Hide inactive' : 'Show inactive'}
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center">
            <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">
              {showInactive ? 'No notifications yet.' : 'No active notifications.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">Message</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Sent</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Expires</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {notifications.map(n => {
                  const expired = n.expires_at != null && new Date(n.expires_at) < new Date()
                  return (
                    <tr
                      key={n.id}
                      className={`hover:bg-slate-50 transition-colors ${!n.is_active ? 'opacity-50' : ''}`}
                    >
                      <td className="px-5 py-3.5 text-slate-800 max-w-xs">
                        <p className="line-clamp-2 leading-snug">{n.message}</p>
                        {!n.is_active && (
                          <span className="text-xs text-slate-400">(inactive)</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <TypeBadge type={n.type} />
                          {n.show_on_home_page && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-700">
                              <Home className="w-3 h-3" />Home page
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">
                        {formatDate(n.created_at)}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {n.expires_at ? (
                          <span className={expired ? 'text-red-400 text-sm' : 'text-slate-500 text-sm'}>
                            {formatDate(n.expires_at)}
                            {expired && ' (expired)'}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-sm">Never</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {n.is_active && (
                          <button
                            onClick={() => handleDeactivate(n.id)}
                            disabled={deactivating === n.id}
                            className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {deactivating === n.id ? 'Deactivating...' : 'Deactivate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
