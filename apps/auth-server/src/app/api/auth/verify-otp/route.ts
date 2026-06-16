import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hashPhone, normalizePhone } from '@/lib/phone-hash'
import { registerRIToOps } from '@/lib/register-ri-to-ops'

export async function POST(request: NextRequest) {
  let body: { phoneNumber?: string; otp?: string; electionId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청입니다' }, { status: 400 })
  }

  const { phoneNumber, otp, electionId } = body

  if (!phoneNumber || !otp || !electionId) {
    return NextResponse.json({ success: false, error: '필수 입력값이 누락되었습니다' }, { status: 400 })
  }

  const normalized = normalizePhone(phoneNumber)
  const phoneHash = hashPhone(normalized)
  const now = new Date()

  // 가장 최근에 발급된 유효한 OTP 조회
  const { data: otpRecord } = await supabase
    .from('otp_requests')
    .select('id, otp_code, expires_at')
    .eq('phone_hash', phoneHash)
    .eq('is_used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!otpRecord) {
    return NextResponse.json({ success: false, error: 'OTP가 올바르지 않습니다' }, { status: 400 })
  }

  if (new Date(otpRecord.expires_at) < now) {
    return NextResponse.json({ success: false, error: 'OTP가 만료되었습니다' }, { status: 400 })
  }

  if (otpRecord.otp_code !== otp) {
    return NextResponse.json({ success: false, error: 'OTP가 올바르지 않습니다' }, { status: 400 })
  }

  // 투표권 확인
  const { data: voter } = await supabase
    .from('voters')
    .select('id, is_voted')
    .eq('phone_number', phoneHash)
    .eq('election_id', electionId)
    .maybeSingle()

  if (!voter) {
    return NextResponse.json({ success: false, error: '투표권이 없습니다' }, { status: 403 })
  }

  if (voter.is_voted) {
    return NextResponse.json({ success: false, error: '이미 투표하셨습니다' }, { status: 403 })
  }

  // OTP 사용 처리
  await supabase.from('otp_requests').update({ is_used: true }).eq('id', otpRecord.id)

  // RI 생성 및 발급 시각 기록 (RI 자체는 DB에 저장하지 않음)
  const ri = crypto.randomUUID()
  const expiresAt = new Date(now.getTime() + 30 * 60_000)

  await supabase
    .from('voters')
    .update({ ri_issued_at: now.toISOString() })
    .eq('id', voter.id)

  // RI-투표자 매핑 저장 (투표 완료 신호 수신 시 is_voted 갱신에 사용)
  await supabase.from('ri_voter_map').insert({
    ri_value: ri,
    voter_id: voter.id,
    expires_at: expiresAt.toISOString(),
  })

  // 운영서버에 RI 등록
  const registered = await registerRIToOps(ri, electionId, expiresAt)

  if (!registered) {
    return NextResponse.json(
      { success: false, error: '운영 서버 연결에 실패했습니다. 다시 시도해주세요' },
      { status: 503 },
    )
  }

  return NextResponse.json({
    success: true,
    ri,
    opsServerUrl: process.env.OPS_SERVER_URL,
    expiresAt: expiresAt.toISOString(),
  })
}
