import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendSms } from '@/lib/sms'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.AUTH_TO_OPS_SECRET}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: { originalRi?: string; publicRi?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청입니다' }, { status: 400 })
  }

  const { originalRi, publicRi } = body
  if (!originalRi) {
    return NextResponse.json({ success: false, error: '원본RI 누락' }, { status: 400 })
  }

  // 매핑 조회 — 없으면 이미 처리된 것으로 간주 (멱등성 ACK)
  const { data: mapping } = await supabase
    .from('ri_voter_map')
    .select('id, voter_id, phone_number')
    .eq('ri_value', originalRi)
    .maybeSingle()

  if (!mapping) {
    return NextResponse.json({ success: true, alreadyProcessed: true })
  }

  // voters.is_voted = true 갱신 (election_id도 함께 조회)
  const { data: voter } = await supabase
    .from('voters')
    .select('election_id')
    .eq('id', mapping.voter_id)
    .maybeSingle()

  await supabase.from('voters').update({ is_voted: true }).eq('id', mapping.voter_id)

  // 매핑 삭제 (사용 완료 — phone_number 포함한 임시 데이터 정리)
  await supabase.from('ri_voter_map').delete().eq('id', mapping.id)

  // SMS 발송 (best-effort — 실패해도 투표 완료 처리에 영향 없음)
  if (publicRi && mapping.phone_number && voter?.election_id) {
    const { data: election } = await supabase
      .from('elections')
      .select('title')
      .eq('id', voter.election_id)
      .maybeSingle()
    const title = election?.title ?? voter.election_id
    const smsBody = `[${title}] 확인코드: ${publicRi}. 선거 후 이 코드로 본인 투표를 확인하세요.`
    console.log(
      `\n[SMS 발송] 전화번호: ${mapping.phone_number} | 메시지: ${smsBody}\n`,
    )
    void sendSms(mapping.phone_number, smsBody)
  }

  return NextResponse.json({ success: true })
}
