import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hashPhone, normalizePhone, isValidKoreanPhone } from '@/lib/phone-hash'
import { generateOtp } from '@/lib/otp-generator'
import { sendOtpSms } from '@/lib/twilio'
import { getSimulationMode } from '@/lib/getMode'

// IP당 분당 3회 제한 (MVP 수준 인메모리)
const rateLimitMap = new Map<string, number[]>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const windowMs = 60_000
  const maxRequests = 3

  const timestamps = (rateLimitMap.get(ip) ?? []).filter(t => now - t < windowMs)
  if (timestamps.length >= maxRequests) return true

  timestamps.push(now)
  rateLimitMap.set(ip, timestamps)
  return false
}

export async function POST(request: NextRequest) {
  const isSimulation = await getSimulationMode()
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { success: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요' },
      { status: 429 },
    )
  }

  let body: { phoneNumber?: string; electionId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청입니다' }, { status: 400 })
  }

  const normalized = normalizePhone(body.phoneNumber ?? '')

  if (!isValidKoreanPhone(normalized)) {
    return NextResponse.json(
      { success: false, error: '올바른 전화번호 형식이 아닙니다 (010xxxxxxxx)' },
      { status: 400 },
    )
  }

  const phoneHash = hashPhone(normalized)

  // 선거인명부 확인 (electionId가 제공된 경우)
  if (body.electionId) {
    const { data: voter } = await supabase
      .from('voters')
      .select('id')
      .eq('phone_number', phoneHash)
      .eq('election_id', body.electionId)
      .maybeSingle()

    if (!voter) {
      return NextResponse.json(
        { success: false, error: '선거인명부에 등록되지 않은 번호입니다. 투표권이 없습니다' },
        { status: 403 },
      )
    }
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString()

  const { data: existing } = await supabase
    .from('otp_requests')
    .select('id')
    .eq('phone_hash', phoneHash)
    .eq('is_used', false)
    .gte('created_at', fiveMinutesAgo)
    .limit(1)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { success: false, error: '이미 발송된 OTP가 있습니다. 5분 후 재시도해주세요' },
      { status: 400 },
    )
  }

  const otp = generateOtp()
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString()

  const { error: insertError } = await supabase.from('otp_requests').insert({
    phone_hash: phoneHash,
    otp_code: otp,
    expires_at: expiresAt,
  })

  if (insertError) {
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다' }, { status: 500 })
  }

  // 시뮬레이션 모드: Twilio 호출 없이 OTP를 응답에 포함하여 반환
  if (isSimulation) {
    console.log(`[SIMULATION] OTP 생성 완료 (Twilio 미호출) → ${normalized} | OTP: ${otp}`)
    return NextResponse.json({
      success: true,
      message: '시뮬레이션 모드: OTP가 화면에 표시됩니다',
      otp,
    })
  }

  // 실전 모드: Twilio SMS 발송
  const twilioConfigured =
    process.env.TWILIO_ACCOUNT_SID &&
    !process.env.TWILIO_ACCOUNT_SID.startsWith('여기에')

  if (twilioConfigured) {
    try {
      await sendOtpSms(normalized, otp)
    } catch {
      return NextResponse.json({ success: false, error: 'SMS 발송에 실패했습니다' }, { status: 500 })
    }
  } else {
    // Twilio 미설정 시 개발용 콘솔 출력
    console.log(`\n[DEV OTP] 전화번호: ${normalized} | OTP: ${otp} | 만료: 5분\n`)
  }

  return NextResponse.json({ success: true, message: 'OTP가 발송되었습니다' })
}
