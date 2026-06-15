'use strict'
// 마이그레이션 + ACK/재시도/멱등성 구현 검증 스크립트
// 실행: node tests/verify_ack_fix.js

const { createHash, createHmac, randomUUID } = require('crypto')
const path = require('path')
const fs = require('fs')
const { createClient } = require(path.join(__dirname, '../node_modules/@supabase/supabase-js'))

function parseEnv(relPath) {
  const out = {}
  try {
    fs.readFileSync(path.join(__dirname, relPath), 'utf8').split('\n').forEach(line => {
      const m = line.match(/^([A-Z_]+)=(.+)$/)
      if (m) out[m[1]] = m[2].trim()
    })
  } catch { console.error(`env 로드 실패: ${relPath}`) }
  return out
}
const opsEnv = parseEnv('../apps/ops-server/.env.local')

const AUTH  = 'http://localhost:3001'
const OPS   = 'http://localhost:3002'
const COUNT = 'http://localhost:3003'
const ELECTION_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const SUPABASE_URL        = opsEnv.OPS_SUPABASE_URL
const SUPABASE_KEY        = opsEnv.OPS_SUPABASE_SERVICE_KEY
const AUTH_TO_OPS_SECRET  = opsEnv.AUTH_TO_OPS_SECRET
const OPS_HMAC_SECRET     = opsEnv.OPS_HMAC_SECRET
const OPS_TO_COUNT_SECRET = opsEnv.OPS_TO_COUNT_SECRET

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

function randomPhone() {
  return '010' + String(Math.floor(10000000 + Math.random() * 90000000))
}
function hashPhone(p) {
  return createHash('sha256').update(p).digest('hex')
}
const delay = ms => new Promise(r => setTimeout(r, ms))

async function registerVoter(phone) {
  const hash = hashPhone(phone)
  await sb.from('voters').insert({ phone_number: hash, election_id: ELECTION_ID })
  return hash
}

async function insertOtp(phoneHash, otp) {
  const expires = new Date(Date.now() + 5 * 60_000).toISOString()
  await sb.from('otp_requests').insert({ phone_hash: phoneHash, otp_code: otp, expires_at: expires })
}

async function verifyOtp(phone, otp) {
  const r = await fetch(`${AUTH}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.1.1' },
    body: JSON.stringify({ phoneNumber: phone, otp, electionId: ELECTION_ID }),
  })
  return r.json()
}

async function submitVote(ri, optionId) {
  const r = await fetch(`${OPS}/api/vote/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ri, electionId: ELECTION_ID, selectedOptionId: optionId }),
  })
  return r.json()
}

async function getFirstOption() {
  const { data } = await sb.from('ballot_options').select('id').eq('election_id', ELECTION_ID).order('display_order').limit(1)
  return data?.[0]?.id
}

let passed = 0
let failed = 0

async function check(name, fn) {
  process.stdout.write(`[확인] ${name} ... `)
  try {
    const result = await fn()
    if (result.ok) {
      console.log('✅ PASS')
      if (result.note) console.log(`       ${result.note}`)
      passed++
    } else {
      console.log(`❌ FAIL: ${result.reason}`)
      failed++
    }
  } catch (e) {
    console.log(`❌ ERROR: ${e.message}`)
    failed++
  }
}

async function main() {
  console.log('=== ACK/재시도/멱등성 + 1인1표 버그 수정 검증 ===\n')

  // (A) 마이그레이션 테이블 존재 여부
  await check('마이그레이션: ri_voter_map 테이블 존재', async () => {
    const { error } = await sb.from('ri_voter_map').select('id').limit(1)
    return error ? { ok: false, reason: error.message } : { ok: true }
  })

  await check('마이그레이션: pending_vote_completions 테이블 존재', async () => {
    const { error } = await sb.from('pending_vote_completions').select('id').limit(1)
    return error ? { ok: false, reason: error.message } : { ok: true }
  })

  await check('마이그레이션: pending_certificates 테이블 존재', async () => {
    const { error } = await sb.from('pending_certificates').select('id').limit(1)
    return error ? { ok: false, reason: error.message } : { ok: true }
  })

  // (B) vote-completed 엔드포인트 동작 확인
  await check('vote-completed 엔드포인트 — 알 수 없는 RI → 멱등성 ACK', async () => {
    const r = await fetch(`${AUTH}/api/internal/vote-completed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AUTH_TO_OPS_SECRET}` },
      body: JSON.stringify({ originalRi: 'unknown-ri-' + randomUUID() }),
    })
    const d = await r.json()
    return r.ok && d.success ? { ok: true } : { ok: false, reason: JSON.stringify(d) }
  })

  await check('vote-completed 엔드포인트 — 인증 없음 → 401', async () => {
    const r = await fetch(`${AUTH}/api/internal/vote-completed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalRi: 'any' }),
    })
    return r.status === 401 ? { ok: true } : { ok: false, reason: `status ${r.status}` }
  })

  // (C) 정상 투표 흐름 → is_voted 갱신 확인
  const phone1 = randomPhone()
  const otp1 = '111111'
  let voterId1

  await check('정상 투표 후 voters.is_voted = true 갱신 확인', async () => {
    const hash = await registerVoter(phone1)
    await insertOtp(hash, otp1)
    await delay(400)

    const vr = await verifyOtp(phone1, otp1)
    if (!vr.success) return { ok: false, reason: `verify-otp 실패: ${vr.error}` }

    // ri_voter_map에 매핑이 생성되었는지 확인
    const { data: mapping } = await sb.from('ri_voter_map').select('id, voter_id').eq('ri_value', vr.ri).maybeSingle()
    if (!mapping) return { ok: false, reason: 'ri_voter_map에 매핑 없음 — verify-otp 미삽입' }
    voterId1 = mapping.voter_id

    // 투표 제출
    const optionId = await getFirstOption()
    const sr = await submitVote(vr.ri, optionId)
    if (!sr.success) return { ok: false, reason: `submit 실패: ${sr.error}` }

    await delay(600) // 완료신호 처리 대기

    // voters.is_voted 확인
    const { data: voter } = await sb.from('voters').select('is_voted').eq('id', voterId1).maybeSingle()
    if (!voter?.is_voted) return { ok: false, reason: `is_voted 여전히 false — 완료신호 미처리` }

    // ri_voter_map 매핑 삭제 확인
    const { data: mapping2 } = await sb.from('ri_voter_map').select('id').eq('voter_id', voterId1).maybeSingle()
    if (mapping2) return { ok: false, reason: 'ri_voter_map 매핑이 삭제되지 않음' }

    return { ok: true, note: `voter ${voterId1.slice(0, 8)}... is_voted=true, 매핑 삭제 완료` }
  })

  // (D) 1인1표: 동일 전화번호로 재투표 시도 → 거부
  await check('1인1표: 투표 완료 후 재투표 시도 → 403 거부', async () => {
    if (!voterId1) return { ok: false, reason: '이전 테스트 실패로 voter 없음' }

    const otp2 = '222222'
    const hash = hashPhone(phone1)
    await insertOtp(hash, otp2)
    await delay(400)

    const vr2 = await verifyOtp(phone1, otp2)
    if (vr2.success) return { ok: false, reason: '재투표가 허용됨 — is_voted 검사 미작동' }
    if (vr2.error?.includes('이미 투표')) return { ok: true, note: `거부 메시지: "${vr2.error}"` }
    return { ok: false, reason: `예상치 못한 오류: ${vr2.error}` }
  })

  // (E) 중복 확인서 — count-server 멱등성 ACK
  await check('count-server 중복 확인서 → 200 ACK (멱등성)', async () => {
    const publicRi = `WildRiver_${randomUUID()}_aabb1122_ccdd3344`
    const optionId = await getFirstOption()
    const certData = {
      publicRi,
      electionId: ELECTION_ID,
      selectedOptionId: optionId,
      selectedOptionText: '찬성',
      createdAt: new Date().toISOString(),
    }
    const hmacSignature = createHmac('sha256', OPS_HMAC_SECRET)
      .update(JSON.stringify(certData))
      .digest('hex')
    const cert = { ...certData, hmacSignature }

    // 첫 번째 전송 (publicRi 기반)
    const r1 = await fetch(`${COUNT}/api/internal/receive-certificate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPS_TO_COUNT_SECRET}` },
      body: JSON.stringify(cert),
    })
    if (!r1.ok) return { ok: false, reason: `첫 전송 실패: ${r1.status}` }

    // 두 번째 전송 (동일 publicRi) → 200 ACK 기대
    const r2 = await fetch(`${COUNT}/api/internal/receive-certificate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPS_TO_COUNT_SECRET}` },
      body: JSON.stringify(cert),
    })
    const d2 = await r2.json()
    if (r2.ok && d2.success && d2.duplicate) return { ok: true, note: '중복 전송 → 200 ACK + duplicate:true' }
    return { ok: false, reason: `중복 전송 응답: status=${r2.status} body=${JSON.stringify(d2)}` }
  })

  console.log(`\n══════════════════════════════`)
  console.log(`결과: ${passed}/${passed + failed} 통과`)
  if (failed > 0) console.log(`실패: ${failed}개`)
  console.log('══════════════════════════════')

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
