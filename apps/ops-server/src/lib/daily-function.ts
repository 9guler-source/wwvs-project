import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto'

function getEncryptionKey(): Buffer {
  const hex = process.env.DAILY_FUNCTION_ENCRYPTION_KEY!
  if (!hex || hex.length !== 64) throw new Error('DAILY_FUNCTION_ENCRYPTION_KEY 미설정 또는 형식 오류 (32바이트 hex 필요)')
  return Buffer.from(hex, 'hex')
}

// AES-256-GCM 암호화 → "iv:ciphertext:tag" (hex)
export function encryptSalt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`
}

// AES-256-GCM 복호화
export function decryptSalt(stored: string): string {
  const [ivHex, encHex, tagHex] = stored.split(':')
  const key = getEncryptionKey()
  const iv = Buffer.from(ivHex, 'hex')
  const enc = Buffer.from(encHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(enc, undefined, 'utf8') + decipher.final('utf8')
}

// F(salt, input) = HMAC-SHA256(salt, input)의 앞 8 hex 자리
export function computeF(salt: string, input: string): string {
  return createHmac('sha256', salt).update(input).digest('hex').slice(0, 8)
}
