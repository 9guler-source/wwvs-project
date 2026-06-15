'use strict'
// 공개용RI 무결성 검증 도구
// F1/F2 공개 후 임의의 공개용RI가 정상인지 판별
// 실행: node tests/verify_public_ri.js <publicRi> [f1Salt] [f2Salt]
//
// f1Salt/f2Salt 생략 시 ops-server /api/admin/publish-functions에서 자동 조회
// 예: node tests/verify_public_ri.js "BraveRiver_a8a2159a-..._3f4e5a6b_7c8d9e0f"

const { createHmac } = require('crypto')
const path = require('path')

const OPS = 'http://localhost:3002'
const ELECTION_ID = 'aaaaaaaa-0000-0000-0000-000000000001'

const fs = require('fs')
const envPath = path.join(__dirname, '../apps/ops-server/.env.local')
const env = {}
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([A-Z_]+)=(.+)$/)
  if (m) env[m[1]] = m[2].trim()
})

function computeF(salt, input) {
  return createHmac('sha256', salt).update(input).digest('hex').slice(0, 8)
}

function parsePublicRi(publicRi) {
  const parts = publicRi.split('_')
  if (parts.length !== 4) return null
  const [markWord, newRi, mark1, mark2] = parts
  if (!/^[a-f0-9-]{36}$/.test(newRi)) return null
  if (!/^[a-f0-9]{8}$/.test(mark1) || !/^[a-f0-9]{8}$/.test(mark2)) return null
  return { markWord, newRi, mark1, mark2 }
}

function verifyPublicRi(publicRi, f1Salt, f2Salt) {
  console.log(`\n=== 공개용RI 검증 ===`)
  console.log(`입력: ${publicRi}`)

  const parsed = parsePublicRi(publicRi)
  if (!parsed) {
    console.log(`❌ 형식 오류: 공개용RI 파싱 실패 (형식: {앞마크}_{UUID}_{mark1}_{mark2})`)
    return false
  }

  const { markWord, newRi, mark1, mark2 } = parsed
  console.log(`  앞마크:  ${markWord}`)
  console.log(`  신규RI:  ${newRi}`)
  console.log(`  1차마크: ${mark1}`)
  console.log(`  2차마크: ${mark2}`)

  const expectedMark1 = computeF(f1Salt, markWord)
  const expectedMark2 = computeF(f2Salt, mark1)

  console.log(`\n  F1(앞마크) 재계산: ${expectedMark1}  →  ${mark1 === expectedMark1 ? '✅ 일치' : '❌ 불일치'}`)
  console.log(`  F2(1차마크) 재계산: ${expectedMark2}  →  ${mark2 === expectedMark2 ? '✅ 일치' : '❌ 불일치'}`)

  const valid = mark1 === expectedMark1 && mark2 === expectedMark2
  console.log(`\n판정: ${valid ? '✅ 유효함' : '❌ 위조 의심'}`)
  return valid
}

async function main() {
  const publicRi = process.argv[2]
  let f1Salt = process.argv[3]
  let f2Salt = process.argv[4]

  if (!publicRi) {
    console.error('Usage: node tests/verify_public_ri.js <publicRi> [f1Salt] [f2Salt]')
    process.exit(1)
  }

  if (!f1Salt || !f2Salt) {
    console.log('F1/F2 salt를 /api/admin/publish-functions에서 조회합니다...')
    const res = await fetch(`${OPS}/api/admin/publish-functions/${ELECTION_ID}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPS_HMAC_SECRET}` },
    })
    if (!res.ok) {
      console.error('F1/F2 조회 실패:', res.status, await res.text())
      process.exit(1)
    }
    const data = await res.json()
    f1Salt = data.f1Salt
    f2Salt = data.f2Salt
    console.log('  조회 성공 (is_published=true로 변경됨)')
  }

  const valid = verifyPublicRi(publicRi, f1Salt, f2Salt)
  process.exit(valid ? 0 : 1)
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
