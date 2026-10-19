import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = () => process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function supabaseConfigured() {
  return !!url() && !!key();
}

let client: SupabaseClient | null = null;

/**
 * Cliente do servidor (service role). Nunca importar em componentes de cliente.
 * `cache: 'no-store'` impede o cache de fetch do Next.js de devolver dados antigos após um reload.
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseConfigured()) throw new Error('Supabase não configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  if (!client) {
    client = createClient(url(), key(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
    });
  }
  return client;
}
