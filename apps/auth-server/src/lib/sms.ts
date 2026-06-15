import twilio from 'twilio'

/** 010XXXXXXXX → +8210XXXXXXXX */
function toE164Korea(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('82')) return `+${digits}`
  if (digits.startsWith('010')) return `+82${digits.slice(1)}`
  return `+${digits}`
}

/**
 * SMS를 발송합니다. 실패해도 예외를 던지지 않습니다 (best-effort).
 * TWILIO_PHONE_NUMBER가 없으면 로그만 출력하고 종료합니다.
 */
export async function sendSms(to: string, body: string): Promise<void> {
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from  = process.env.TWILIO_PHONE_NUMBER

  if (!sid || !token) {
    console.warn('[SMS] TWILIO_ACCOUNT_SID 또는 TWILIO_AUTH_TOKEN 미설정 — 발송 건너뜀')
    return
  }
  if (!from) {
    console.warn('[SMS] TWILIO_PHONE_NUMBER 미설정 — 발송 건너뜀')
    return
  }

  const toE164 = toE164Korea(to)
  try {
    const client = twilio(sid, token)
    const message = await client.messages.create({ from, to: toE164, body })
    console.log(`[SMS] 발송 성공 → ${toE164} | SID: ${message.sid}`)
  } catch (err: unknown) {
    const e = err as { code?: number; message?: string; status?: number }
    console.error(
      `[SMS] 발송 실패 → ${toE164} | ` +
      `Twilio 오류 ${e.code ?? ''} (HTTP ${e.status ?? '?'}): ${e.message ?? err}`,
    )
  }
}
