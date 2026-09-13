import { createClient as createSupabaseClient } from "@supabase/supabase-js"

/**
 * Server-only Supabase client authenticated with the service role key.
 * It bypasses RLS, so it must only be used from trusted server code
 * (e.g. the reminders cron) and never imported into client components.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
