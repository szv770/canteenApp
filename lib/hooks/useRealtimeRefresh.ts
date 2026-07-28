'use client'

import { useEffect, useId, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export interface UseRealtimeRefreshOptions {
  /** Table name, e.g. 'bochurim'. Must be in the `supabase_realtime` publication. */
  table: string
  /** Defaults to '*' (INSERT + UPDATE + DELETE). */
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  /** Defaults to 'public'. */
  schema?: string
  /** PostgREST-style row filter, e.g. `id=eq.${id}` or `for_date=eq.${date}`. */
  filter?: string
  /** When false, no subscription is opened at all (e.g. "only once a bochur is loaded"). */
  enabled?: boolean
  onChange: (payload: RealtimePostgresChangesPayload<any>) => void
}

/**
 * Wraps ONLY the Supabase realtime subscribe/teardown boilerplate.
 *
 * Deliberately has no opinion on what to do with a change — the caller decides
 * whether to silently merge the payload, refetch, or prompt with a toast.
 */
export function useRealtimeRefresh({
  table,
  event = '*',
  schema = 'public',
  filter,
  enabled = true,
  onChange,
}: UseRealtimeRefreshOptions) {
  // Every component in this codebase creates its own client independently; keep
  // that convention rather than threading a shared one through.
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  if (supabaseRef.current === null) supabaseRef.current = createClient()
  const supabase = supabaseRef.current

  // The latest onChange lives in a ref, updated on EVERY render (no dep array), so
  // the subscription effect below never has to list it as a dependency. Callers
  // pass inline arrows whose identity changes every render — depending on it would
  // tear down and re-open the channel constantly; closing over it once instead
  // would leave the handler permanently stale.
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })

  // Unique per hook instance, not just per table — two components subscribing to
  // the same table (e.g. the POS page and an open bochur profile modal) would
  // otherwise share a channel name and clobber each other.
  const instanceId = useId().replace(/[^a-zA-Z0-9]/g, '')

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel(`rt-${table}-${instanceId}`)
      .on(
        'postgres_changes',
        // `filter` must be omitted entirely (not passed as undefined) when unset.
        { event, schema, table, ...(filter ? { filter } : {}) } as any,
        (payload: RealtimePostgresChangesPayload<any>) => onChangeRef.current(payload)
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // NOTE: onChange is intentionally absent — see the ref comment above. Changing
    // `filter`/`event`/`enabled` correctly tears down and resubscribes.
  }, [table, event, schema, filter, enabled, instanceId, supabase])
}

export default useRealtimeRefresh
