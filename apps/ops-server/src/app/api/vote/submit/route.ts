import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { signCertificate } from '@/lib/hmac'
import { sendCertificateToCount } from '@/lib/send-to-count'
import { trySendCompletionToAuth } from '@/lib/send-completion-to-auth'
import { decryptSalt } from '@/lib/daily-function'
import { buildPublicRi } from '@/lib/public-ri'

export async function POST(request: NextRequest) {
  let body: { ri?: string; electionId?: string; selectedOptionId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청입니다' }, { status: 400 })
  }

  const { ri, electionId, selectedOptionId } = body
  if (!ri || !electionId || !selectedOptionId) {
    return NextResponse.json({ success: false, error: '필수 필드 누락' }, { status: 400 })
  }

  // RI 유효성 확인
  const { data: riRecord } = await supabase
    .from('ri_ledger')
    .select('id, is_used, expires_at')
    .eq('ri_value', ri)
    .eq('election_id', electionId)
    .maybeSingle()

  if (!riRecord) {
    return NextResponse.json({ success: false, error: '유효하지 않은 접근입니다' }, { status: 403 })
  }
  if (riRecord.is_used) {
    return NextResponse.json({ success: false, error: '이미 사용된 투표 코드입니다' }, { status: 403 })
  }
  if (new Date(riRecord.expires_at) < new Date()) {
    return NextResponse.json({ success: false, error: '투표 시간이 만료되었습니다' }, { status: 403 })
  }

  // 투표 항목 유효성 확인
  const { data: option } = await supabase
    .from('ballot_options')
    .select('id, option_text')
    .eq('id', selectedOptionId)
    .eq('election_id', electionId)
    .maybeSingle()

  if (!option) {
    return NextResponse.json({ success: false, error: '유효하지 않은 투표 항목입니다' }, { status: 400 })
  }

  // 원자적 RI 소비 — WHERE is_used=false 조건으로 이중 제출 방지
  const now = new Date().toISOString()
  const { data: updatedRows } = await supabase
    .from('ri_ledger')
    .update({ is_used: true, used_at: now })
    .eq('id', riRecord.id)
    .eq('is_used', false)
    .select('id')

  if (!updatedRows || updatedRows.length === 0) {
    return NextResponse.json({ success: false, error: '이미 사용된 투표 코드입니다' }, { status: 403 })
  }

  // 신규 RI 생성 (내부용 — 외부 응답/저장에는 공개용RI 사용)
  const newRi = crypto.randomUUID()

  // 앞마크 선택 (is_assigned=false 중 무작위 1개)
  const { data: markRow, error: markError } = await supabase
    .from('mark_pool')
    .select('id, mark_word')
    .eq('election_id', electionId)
    .eq('is_assigned', false)
    .order('id')   // 안정적 결정론적 순서 후 LIMIT
    .limit(50)     // 풀에서 50개 후보 중 JS에서 무작위 선택

  if (markError || !markRow || markRow.length === 0) {
    console.error('[submit] mark_pool 조회 실패 또는 소진', markError)
    return NextResponse.json({ success: false, error: '선거 설정 오류 (앞마크 풀 소진)' }, { status: 500 })
  }

  const picked = markRow[Math.floor(Math.random() * markRow.length)]
  await supabase
    .from('mark_pool')
    .update({ is_assigned: true, assigned_at: now })
    .eq('id', picked.id)

  // F1/F2 salt 복호화 (메모리 내에서만 사용)
  const { data: df, error: dfError } = await supabase
    .from('daily_functions')
    .select('f1_encrypted, f2_encrypted')
    .eq('election_id', electionId)
    .maybeSingle()

  if (dfError || !df) {
    console.error('[submit] daily_functions 없음', dfError)
    return NextResponse.json({ success: false, error: '선거 설정 오류 (오늘의 함수 미설정)' }, { status: 500 })
  }

  let f1Salt: string, f2Salt: string
  try {
    f1Salt = decryptSalt(df.f1_encrypted)
    f2Salt = decryptSalt(df.f2_encrypted)
  } catch (e) {
    console.error('[submit] salt 복호화 실패', e)
    return NextResponse.json({ success: false, error: '선거 설정 오류 (암호화 키 불일치)' }, { status: 500 })
  }

  // 공개용RI 생성: {앞마크}_{신규RI}_{1차마크}_{2차마크}_{투표내역암호화값}
  const publicRi = buildPublicRi(picked.mark_word, newRi, f1Salt, f2Salt, option.option_text)

  // 투표확인서 생성 (공개용RI 기반)
  const certificateData = {
    publicRi,
    electionId,
    selectedOptionId,
    selectedOptionText: option.option_text,
    createdAt: now,
  }
  const hmacSignature = signCertificate(certificateData)
  const certificate = { ...certificateData, hmacSignature }

  // 개표서버에 확인서 전송 (3회 시도)
  // 실패 시 pending_certificates에 임시 저장 — 전송 성공 후 즉시 삭제되는 단기 재시도 큐
  const certSent = await sendCertificateToCount(certificate)
  if (!certSent) {
    console.error('[submit] 개표서버 확인서 전송 3회 실패 — 재시도 큐 저장', { publicRi: publicRi.split('_')[0] })
    await supabase.from('pending_certificates').insert({ certificate_data: certificate })
  }

  // 인증서버에 투표 완료 신호 전송 (1회 시도) — 실패 시 pending_vote_completions에 저장
  const completionSent = await trySendCompletionToAuth(ri)
  if (!completionSent) {
    console.error('[submit] 완료신호 전송 실패 — 대기열 저장', { ri: ri.slice(0, 8) })
    await supabase.from('pending_vote_completions').insert({ original_ri: ri })
  }

  return NextResponse.json({ success: true, certificate })
}
