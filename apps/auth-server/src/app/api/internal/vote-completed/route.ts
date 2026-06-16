import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.AUTH_TO_OPS_SECRET}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: { originalRi?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청입니다' }, { status: 400 })
  }

  const { originalRi } = body
  if (!originalRi) {
    return NextResponse.json({ success: false, error: '원본RI 누락' }, { status: 400 })
  }

  // 매핑 조회 — 없으면 이미 처리된 것으로 간주 (멱등성 ACK)
  const { data: mapping } = await supabase
    .from('ri_voter_map')
    .select('id, voter_id')
    .eq('ri_value', originalRi)
    .maybeSingle()

  if (!mapping) {
    return NextResponse.json({ success: true, alreadyProcessed: true })
  }

  // voters.is_voted = true 갱신
  await supabase.from('voters').update({ is_voted: true }).eq('id', mapping.voter_id)

  // 매핑 삭제 (사용 완료)
  await supabase.from('ri_voter_map').delete().eq('id', mapping.id)

  return NextResponse.json({ success: true })
}
