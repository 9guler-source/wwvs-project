import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checkAdminAuth } from '@/lib/admin-auth'

export async function GET(request: NextRequest) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('elections')
    .select('id, title, status, opens_at, closes_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, elections: data ?? [] })
}
