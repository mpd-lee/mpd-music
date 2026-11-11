import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let browserClient: SupabaseClient | null = null

/**
 * Accepts the project URL only. If a REST endpoint was accidentally pasted
 * (for example, /rest/v1/), remove the API path before createClient uses it.
 */
export function getSupabaseProjectUrl() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!rawUrl) return ''

  try {
    const url = new URL(rawUrl)
    url.pathname = url.pathname
      .replace(/\/(rest|auth|storage)\/v1\/?$/i, '')
      .replace(/\/+$/, '')
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

/** Supports both the newer publishable key name and the older anon-key name. */
export function getSupabasePublicKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    ''
  )
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseProjectUrl() && getSupabasePublicKey())
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null
  if (!browserClient) {
    browserClient = createClient(getSupabaseProjectUrl(), getSupabasePublicKey(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return browserClient
}
