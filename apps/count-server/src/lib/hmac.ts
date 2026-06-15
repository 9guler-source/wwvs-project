import { createHmac } from 'crypto'

export function verifyCertificate(data: {
  publicRi: string
  electionId: string
  selectedOptionId: string
  selectedOptionText: string
  createdAt: string
}, signature: string): boolean {
  const secret = process.env.OPS_HMAC_SECRET!
  const expected = createHmac('sha256', secret).update(JSON.stringify(data)).digest('hex')
  return expected === signature
}
