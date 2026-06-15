import { createHmac } from 'crypto'

export function signCertificate(data: {
  publicRi: string
  electionId: string
  selectedOptionId: string
  selectedOptionText: string
  createdAt: string
}): string {
  const secret = process.env.OPS_HMAC_SECRET!
  return createHmac('sha256', secret).update(JSON.stringify(data)).digest('hex')
}
