import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Service-role client — bypasses Row-Level Security entirely.
// ONLY use this inside server-only routes that do their own auth check
// (like the API-key-protected CI route). NEVER import this anywhere that
// could run in the browser, and NEVER return this client or its results
// without an explicit auth check first — RLS is not protecting you here.
export function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
