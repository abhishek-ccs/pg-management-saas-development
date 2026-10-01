import { createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof createBrowserClient> | undefined

export function createClient() {
  if (client) return client
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
  )
  return client
}

/**
 * Resets the in-memory singleton client (e.g. upon user sign-out or session invalidation)
 */
export function resetClient() {
  client = undefined
}

/**
 * Proactively verifies that the client has an active, valid authentication session.
 * Automatically refreshes stale tokens before protected mutations are executed.
 */
export async function ensureFreshSession(supabaseClient?: ReturnType<typeof createBrowserClient>) {
  const sb = supabaseClient ?? createClient()
  try {
    const { data: { session }, error } = await sb.auth.getSession()
    if (error || !session) {
      // Attempt a refresh before declaring failure
      const { data: refreshed, error: refreshErr } = await sb.auth.refreshSession()
      if (refreshErr || !refreshed.session) {
        return { valid: false, session: null, error: 'Your session has expired. Please sign in again.' }
      }
      return { valid: true, session: refreshed.session, error: null }
    }

    // If token expires within 60 seconds, refresh proactively
    const expiresAtMs = (session.expires_at ?? 0) * 1000
    if (expiresAtMs > 0 && expiresAtMs - Date.now() < 60_000) {
      const { data: refreshed, error: refreshErr } = await sb.auth.refreshSession()
      if (!refreshErr && refreshed.session) {
        return { valid: true, session: refreshed.session, error: null }
      }
    }

    return { valid: true, session, error: null }
  } catch (err: any) {
    return { valid: false, session: null, error: err?.message || 'Authentication error.' }
  }
}

