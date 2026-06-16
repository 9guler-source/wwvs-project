import { computeF } from './daily-function'

// 공개용RI 형식: {앞마크}_{신규RI UUID}_{1차마크}_{2차마크}_{투표내역암호화값}
// 앞마크는 알파벳만 사용(언더스코어 없음) → split('_')으로 5파트 파싱 가능
export function buildPublicRi(
  markWord: string,
  newRi: string,
  f1Salt: string,
  f2Salt: string,
  selectedOptionText: string,
): string {
  const mark1 = computeF(f1Salt, markWord)
  const mark2 = computeF(f2Salt, mark1)
  const voteHash = computeF(f1Salt, selectedOptionText + newRi)
  return `${markWord}_${newRi}_${mark1}_${mark2}_${voteHash}`
}

export interface ParsedPublicRi {
  markWord: string
  newRi: string
  mark1: string
  mark2: string
  voteHash: string
}

// 공개용RI 파싱 — 형식이 맞지 않으면 null 반환
export function parsePublicRi(publicRi: string): ParsedPublicRi | null {
  const parts = publicRi.split('_')
  if (parts.length !== 5) return null
  const [markWord, newRi, mark1, mark2, voteHash] = parts
  // UUID: 8-4-4-4-12 hex (하이픈 포함 36자)
  if (!/^[a-f0-9-]{36}$/.test(newRi)) return null
  // mark1, mark2, voteHash: 8 hex 자리
  if (
    !/^[a-f0-9]{8}$/.test(mark1) ||
    !/^[a-f0-9]{8}$/.test(mark2) ||
    !/^[a-f0-9]{8}$/.test(voteHash)
  ) return null
  return { markWord, newRi, mark1, mark2, voteHash }
}
