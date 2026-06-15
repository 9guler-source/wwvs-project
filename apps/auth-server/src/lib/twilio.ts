import twilio from 'twilio'

let client: ReturnType<typeof twilio> | null = null

function getClient() {
  if (!client) {
    client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  }
  return client
}

export async function sendOtpSms(phoneNumber: string, otp: string): Promise<void> {
  // 한국 번호: 010xxxxxxxx → +8210xxxxxxxx
  const to = phoneNumber.startsWith('+')
    ? phoneNumber
    : `+82${phoneNumber.slice(1)}`

  await getClient().messages.create({
    body: `[WWVS] 인증번호: ${otp} (5분 내 입력해주세요)`,
    from: process.env.TWILIO_PHONE_NUMBER!,
    to,
  })
}
