import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.AUTH_TO_OPS_SECRET}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: { ri?: string; electionId?: string; expiresAt?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청입니다' }, { status: 400 })
  }

  const { ri, electionId, expiresAt } = body
  if (!ri || !electionId || !expiresAt) {
    return NextResponse.json({ success: false, error: '필수 필드 누락' }, { status: 400 })
  }

  const { error } = await supabase.from('ri_ledger').insert({
    ri_value: ri,
    election_id: electionId,
    expires_at: expiresAt,
  })

  if (error) {
    console.error('[receive-ri] insert error', error)
    return NextResponse.json({ success: false, error: 'DB 저장 실패' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
