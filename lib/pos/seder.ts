export interface SederSchedule {
  id: string
  name: string
  days_of_week: number[] // 0=Sun .. 6=Sat
  start_time: string // "HH:MM:SS" or "HH:MM"
  end_time: string
  reminder_minutes_before: number
  skip_dates: string[] // "YYYY-MM-DD", local
  is_active: boolean
  created_at: string
}

// Always derive dates/times from the *local* clock, never UTC — this app has
// been bitten repeatedly by UTC-vs-local calendar-day bugs (see CLAUDE.md
// gotcha #19); seder times are camp wall-clock times, not UTC instants.
export function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function minutesNow(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

function appliesToday(s: SederSchedule, dow: number, dateStr: string): boolean {
  return s.is_active && s.days_of_week.includes(dow) && !s.skip_dates.includes(dateStr)
}

export function getActiveSeder(schedules: SederSchedule[], now: Date): SederSchedule | null {
  const dow = now.getDay()
  const dateStr = localDateStr(now)
  const nowMin = minutesNow(now)
  for (const s of schedules) {
    if (!appliesToday(s, dow, dateStr)) continue
    const start = timeToMinutes(s.start_time)
    const end = timeToMinutes(s.end_time)
    if (nowMin >= start && nowMin < end) return s
  }
  return null
}

export function getUpcomingSeder(schedules: SederSchedule[], now: Date): { seder: SederSchedule; minutesUntil: number } | null {
  const dow = now.getDay()
  const dateStr = localDateStr(now)
  const nowMin = minutesNow(now)
  let best: { seder: SederSchedule; minutesUntil: number } | null = null
  for (const s of schedules) {
    if (!appliesToday(s, dow, dateStr)) continue
    const start = timeToMinutes(s.start_time)
    const minutesUntil = start - nowMin
    if (minutesUntil <= 0 || minutesUntil > s.reminder_minutes_before) continue
    if (!best || minutesUntil < best.minutesUntil) best = { seder: s, minutesUntil }
  }
  return best
}

// Walks forward day-by-day (starting today if this seder hasn't ended yet
// today, otherwise tomorrow) and collects the next `count` calendar dates
// this seder is scheduled to run on, skipping dates already in skip_dates.
// Used by the admin "skip next N" control — converts a fuzzy request into
// concrete dates so there's nothing to silently miscount later.
export function computeNextOccurrenceDates(s: SederSchedule, count: number, now: Date = new Date()): string[] {
  if (s.days_of_week.length === 0 || count <= 0) return []
  const end = timeToMinutes(s.end_time)
  const start = new Date(now)
  if (minutesNow(now) >= end) start.setDate(start.getDate() + 1)

  const dates: string[] = []
  const cursor = new Date(start)
  const MAX_DAYS = 120
  for (let i = 0; i < MAX_DAYS && dates.length < count; i++) {
    const dateStr = localDateStr(cursor)
    if (s.days_of_week.includes(cursor.getDay()) && !s.skip_dates.includes(dateStr) && !dates.includes(dateStr)) {
      dates.push(dateStr)
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

// Drops any skip_dates that are already in the past — keeps the array from
// growing forever with dead entries. Safe to call on every load.
export function pruneStaleSkipDates(s: SederSchedule, now: Date = new Date()): string[] {
  const todayStr = localDateStr(now)
  return s.skip_dates.filter(d => d >= todayStr)
}
