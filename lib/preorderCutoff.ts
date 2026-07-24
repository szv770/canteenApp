// Cutoff math for the Preorders feature. Orders for a given `for_date` close
// at `cutoffTime` (HH:MM) on the evening before, camp-local time. This runs
// both in API routes (Node, defaults to UTC — same issue as the dashboard's
// getZonedTodayBounds, see CLAUDE.md gotcha #25) and in client components
// (which could just read the browser's local time, but share this file for
// one source of truth instead of duplicating the logic two ways).
export const CANTEEN_TZ = 'America/New_York'

function tzOffsetMs(referenceUtc: Date, timeZone: string): number {
  const zoned = new Date(referenceUtc.toLocaleString('en-US', { timeZone }))
  const utc = new Date(referenceUtc.toLocaleString('en-US', { timeZone: 'UTC' }))
  return zoned.getTime() - utc.getTime()
}

// The UTC instant corresponding to a given wall-clock y/m/d hh:mm in `timeZone`.
// Uses noon UTC on that date as the DST-offset reference to avoid edge cases
// right at a spring-forward/fall-back transition.
function zonedWallTimeToUtcInstant(y: number, m: number, d: number, hh: number, mm: number, timeZone: string): Date {
  const referenceUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const offsetMs = tzOffsetMs(referenceUtc, timeZone)
  return new Date(Date.UTC(y, m - 1, d, hh, mm, 0) - offsetMs)
}

export function localDateStrInTz(now: Date, timeZone: string = CANTEEN_TZ): string {
  const zoned = new Date(now.toLocaleString('en-US', { timeZone }))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${zoned.getFullYear()}-${pad(zoned.getMonth() + 1)}-${pad(zoned.getDate())}`
}

// Deadline instant for orders targeting `forDateStr` (YYYY-MM-DD): cutoffTime
// (HH:MM) on the calendar day before, camp-local.
export function cutoffDeadlineForDate(forDateStr: string, cutoffTime: string, timeZone: string = CANTEEN_TZ): Date {
  const [y, m, d] = forDateStr.split('-').map(Number)
  const dayBefore = new Date(Date.UTC(y, m - 1, d - 1, 12))
  const [ch, cm] = cutoffTime.split(':').map(Number)
  return zonedWallTimeToUtcInstant(dayBefore.getUTCFullYear(), dayBefore.getUTCMonth() + 1, dayBefore.getUTCDate(), ch || 0, cm || 0, timeZone)
}

export function isBeforeCutoff(forDateStr: string, cutoffTime: string, now: Date = new Date(), timeZone: string = CANTEEN_TZ): boolean {
  return now.getTime() < cutoffDeadlineForDate(forDateStr, cutoffTime, timeZone).getTime()
}

// Upcoming calendar dates (YYYY-MM-DD) still orderable right now, for date pickers.
export function upcomingOrderableDates(cutoffTime: string, daysAhead = 10, now: Date = new Date(), timeZone: string = CANTEEN_TZ): string[] {
  const todayStr = localDateStrInTz(now, timeZone)
  const [ty, tm, td] = todayStr.split('-').map(Number)
  const dates: string[] = []
  for (let i = 0; i <= daysAhead; i++) {
    const dt = new Date(Date.UTC(ty, tm - 1, td + i, 12))
    const pad = (n: number) => String(n).padStart(2, '0')
    const dateStr = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
    if (isBeforeCutoff(dateStr, cutoffTime, now, timeZone)) dates.push(dateStr)
  }
  return dates
}
