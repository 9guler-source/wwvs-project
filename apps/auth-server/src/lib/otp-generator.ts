import { randomInt } from 'crypto'

export function generateOtp(): string {
  // 암호학적으로 안전한 난수 사용
  return randomInt(100000, 999999).toString()
}
