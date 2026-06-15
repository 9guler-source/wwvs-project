import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.COUNT_SUPABASE_URL!
const supabaseServiceKey = process.env.COUNT_SUPABASE_SERVICE_KEY!

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
})
