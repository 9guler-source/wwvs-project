import type { VoteCertificate } from '@wwvs/shared'

export async function sendCertificateToCount(certificate: VoteCertificate): Promise<boolean> {
  const countServerUrl = process.env.COUNT_SERVER_URL!
  const secret = process.env.OPS_TO_COUNT_SECRET!

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${countServerUrl}/api/internal/receive-certificate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(certificate),
      })
      if (res.ok) return true
      // 중복 확인서(count-server가 이미 저장) → 멱등성 ACK
      if (res.status === 409) return true
    } catch (e) {
      console.error(`[sendCertificateToCount] attempt ${attempt + 1} failed`, e)
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 1000))
  }
  console.error('[sendCertificateToCount] all 3 attempts failed')
  return false
}
