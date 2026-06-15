import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyCertificate } from '@/lib/hmac'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.OPS_TO_COUNT_SECRET}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    publicRi?: string
    electionId?: string
    selectedOptionId?: string
    selectedOptionText?: string
    createdAt?: string
    hmacSignature?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청입니다' }, { status: 400 })
  }

  const { publicRi, electionId, selectedOptionId, selectedOptionText, createdAt, hmacSignature } = body

  if (!publicRi || !electionId || !selectedOptionId || !selectedOptionText || !createdAt || !hmacSignature) {
    return NextResponse.json({ success: false, error: '필수 필드 누락' }, { status: 400 })
  }

  // HMAC 서명 검증
  const isValid = verifyCertificate(
    { publicRi, electionId, selectedOptionId, selectedOptionText, createdAt },
    hmacSignature,
  )
  if (!isValid) {
    console.error('[receive-certificate] HMAC 검증 실패', { publicRi: publicRi.split('_')[0] })
    return NextResponse.json({ success: false, error: '서명 검증 실패' }, { status: 400 })
  }

  // 중복 확인서 차단 (DB UNIQUE 제약)
  const { error } = await supabase.from('vote_certificates').insert({
    election_id: electionId,
    new_ri: publicRi,            // vote_certificates.new_ri 컬럼에 공개용RI 저장
    selected_option_id: selectedOptionId,
    selected_option_text: selectedOptionText,
    hmac_signature: hmacSignature,
    created_at: createdAt,
  })

  if (error) {
    if (error.code === '23505') {
      console.warn('[receive-certificate] 중복 확인서 감지 — 멱등성 ACK', { publicRi: publicRi.split('_')[0] })
      return NextResponse.json({ success: true, duplicate: true })
    }
    console.error('[receive-certificate] DB 저장 실패', error)
    return NextResponse.json({ success: false, error: 'DB 저장 실패' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
