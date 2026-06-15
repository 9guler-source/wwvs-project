import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.AUTH_SUPABASE_URL!
const supabaseServiceKey = process.env.AUTH_SUPABASE_SERVICE_KEY!

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
})
