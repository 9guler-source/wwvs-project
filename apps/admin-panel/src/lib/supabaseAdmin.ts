import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createClient() {
  const url = process.env.ADMIN_SUPABASE_URL!;
  const key = process.env.ADMIN_SUPABASE_SERVICE_KEY!;
  return createSupabaseClient(url, key, {
    auth: { persistSession: false },
    db: { schema: 'public' },
    global: {
      headers: {
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
      },
    },
  });
}
