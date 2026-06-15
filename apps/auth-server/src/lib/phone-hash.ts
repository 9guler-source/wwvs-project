import { createHash } from 'crypto'

export function hashPhone(phoneNumber: string): string {
  return createHash('sha256').update(phoneNumber).digest('hex')
}

export function normalizePhone(raw: string): string {
  return raw.replace(/[-\s]/g, '')
}

export function isValidKoreanPhone(phone: string): boolean {
  return /^010\d{8}$/.test(phone)
}
