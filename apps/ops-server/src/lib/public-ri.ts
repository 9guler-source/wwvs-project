import { computeF } from './daily-function'

// 공개용RI 형식: {앞마크}_{신규RI UUID}_{1차마크}_{2차마크}
// 앞마크는 알파벳만 사용(언더스코어 없음) → split('_')으로 4파트 파싱 가능
export function buildPublicRi(markWord: string, newRi: string, f1Salt: string, f2Salt: string): string {
  const mark1 = computeF(f1Salt, markWord)
  const mark2 = computeF(f2Salt, mark1)
  return `${markWord}_${newRi}_${mark1}_${mark2}`
}

export interface ParsedPublicRi {
  markWord: string
  newRi: string
  mark1: string
  mark2: string
}

// 공개용RI 파싱 — 형식이 맞지 않으면 null 반환
export function parsePublicRi(publicRi: string): ParsedPublicRi | null {
  const parts = publicRi.split('_')
  if (parts.length !== 4) return null
  const [markWord, newRi, mark1, mark2] = parts
  // UUID: 8-4-4-4-12 hex (하이픈 포함 36자)
  if (!/^[a-f0-9-]{36}$/.test(newRi)) return null
  // mark1, mark2: 8 hex 자리
  if (!/^[a-f0-9]{8}$/.test(mark1) || !/^[a-f0-9]{8}$/.test(mark2)) return null
  return { markWord, newRi, mark1, mark2 }
}
