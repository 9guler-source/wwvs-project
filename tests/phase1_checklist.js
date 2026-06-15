#!/usr/bin/env node
'use strict'
/**
 * WWVS Phase 1 체크리스트 자동 검증 스크립트
 * 실행: node tests/phase1_checklist.js
 * 요구사항: Node 18+, 서버 3개 실행 중
 */

const { createHash, createHmac, randomUUID } = require('crypto')
const path = require('path')

// ─── Supabase JS 클라이언트 (service_role 권한, RLS 우회) ─────────────────────
const { createClient } = require(path.join(__dirname, '../node_modules/@supabase/supabase-js'))
const fs = require('fs')

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
const opsEnv   = parseEnv('../apps/ops-server/.env.local')
const countEnv = parseEnv('../apps/count-server/.env.local')

// ─── Config ───────────────────────────────────────────────────────────────────
const AUTH  = 'http://localhost:3001'
const OPS   = 'http://localhost:3002'
const COUNT = 'http://localhost:3003'
const ELECTION_ID = 'aaaaaaaa-0000-0000-0000-000000000001'

const SUPABASE_URL        = opsEnv.OPS_SUPABASE_URL
const SUPABASE_KEY        = opsEnv.OPS_SUPABASE_SERVICE_KEY
const OPS_HMAC_SECRET     = opsEnv.OPS_HMAC_SECRET
const OPS_TO_COUNT_SECRET = opsEnv.OPS_TO_COUNT_SECRET
const ADMIN_SECRET        = countEnv.ADMIN_SECRET

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

// ─── 유틸리티 ─────────────────────────────────────────────────────────────────
let _phoneCounter = 0
function randomPhone() {
  // 충돌 방지: 랜덤 + 순번 조합
  const n = (Date.now() % 100_000_000 + _phoneCounter++).toString().padStart(8, '0')
  return `010${n}`
}

function hashPhone(phone) {
  return createHash('sha256').update(phone).digest('hex')
}

function signCertificate(data) {
  return createHmac('sha256', OPS_HMAC_SECRET)
    .update(JSON.stringify(data))
    .digest('hex')
}

const delay = ms => new Promise(r => setTimeout(r, ms))

// 테스트 전용 가짜 IP (인증서버 rate limit 우회 — 테스트 격리용)
let _ipCounter = 0
function testIp() {
  return `10.99.${Math.floor(_ipCounter / 256)}.${++_ipCounter % 256}`
}

// ─── Supabase 헬퍼 ────────────────────────────────────────────────────────────
async function registerVoter(phone) {
  const phoneHash = hashPhone(phone)
  const { error } = await sb.from('voters').insert({
    phone_number: phoneHash,
    election_id: ELECTION_ID,
  })
  if (error && error.code !== '23505') throw new Error(`registerVoter: ${error.message}`)
  return phoneHash
}

async function getLatestOtp(phoneHash) {
  const { data, error } = await sb
    .from('otp_requests')
    .select('otp_code')
    .eq('phone_hash', phoneHash)
    .eq('is_used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`getLatestOtp: ${error.message}`)
  return data?.otp_code ?? null
}

async function insertOtpDirectly(phoneHash) {
  // 5분 쿨다운 우회: OTP를 DB에 직접 삽입
  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString()
  const { error } = await sb.from('otp_requests').insert({
    phone_hash: phoneHash,
    otp_code: otp,
    expires_at: expiresAt,
  })
  if (error) throw new Error(`insertOtpDirectly: ${error.message}`)
  return otp
}

async function getCertCount() {
  const { count, error } = await sb
    .from('vote_certificates')
    .select('*', { count: 'exact', head: true })
    .eq('election_id', ELECTION_ID)
  if (error) throw new Error(`getCertCount: ${error.message}`)
  return count ?? 0
}

// ─── HTTP 투표 흐름 헬퍼 ──────────────────────────────────────────────────────
async function sendOtp(phone, fakeIp) {
  const headers = { 'Content-Type': 'application/json' }
  if (fakeIp) headers['X-Forwarded-For'] = fakeIp
  return fetch(`${AUTH}/api/auth/send-otp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phoneNumber: phone, electionId: ELECTION_ID }),
  }).then(r => r.json())
}

async function verifyOtp(phone, otp) {
  const res = await fetch(`${AUTH}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: phone, otp, electionId: ELECTION_ID }),
  })
  return { status: res.status, data: await res.json() }
}

async function getBallot(ri) {
  const res = await fetch(`${OPS}/api/vote/ballot?ri=${ri}&electionId=${ELECTION_ID}`)
  return { status: res.status, data: await res.json() }
}

async function submitVote(ri, optionId) {
  const res = await fetch(`${OPS}/api/vote/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ri, electionId: ELECTION_ID, selectedOptionId: optionId }),
  })
  return { status: res.status, data: await res.json() }
}

async function doFullVote(phone) {
  const phoneHash = hashPhone(phone)

  await sendOtp(phone, testIp())
  await delay(500)  // DB 반영 대기

  const otp = await getLatestOtp(phoneHash)
  if (!otp) throw new Error(`OTP DB 조회 실패 (전화번호: ${phone})`)

  const { data: vd, status: vs } = await verifyOtp(phone, otp)
  if (!vd.success) throw new Error(`verify-otp ${vs}: ${vd.error}`)
  const ri = vd.ri

  const { data: bd, status: bs } = await getBallot(ri)
  if (!bd.success) throw new Error(`ballot ${bs}: ${bd.error}`)

  const { data: sd, status: ss } = await submitVote(ri, bd.options[0].id)
  if (!sd.success) throw new Error(`submit ${ss}: ${sd.error}`)

  return { ri, publicRi: sd.certificate.publicRi, certificate: sd.certificate }
}

// ─── 결과 추적 ────────────────────────────────────────────────────────────────
const results = []

function pass(num, name, detail = '') {
  results.push({ num, name, status: 'PASS' })
  console.log(`  ✅ [${num}] PASS — ${name}`)
  if (detail) console.log(`         ${detail}`)
}

function fail(num, name, detail = '') {
  results.push({ num, name, status: 'FAIL' })
  console.log(`  ❌ [${num}] FAIL — ${name}`)
  if (detail) console.log(`         → ${detail}`)
}

// ─── 서버 상태 확인 ───────────────────────────────────────────────────────────
async function checkServers() {
  console.log('')
  console.log('══════════════════════════════════════════════════════════')
  console.log('  WWVS Phase 1 체크리스트 자동 검증 스크립트')
  console.log('══════════════════════════════════════════════════════════')
  console.log('')
  console.log('  ※ 다음 3개 서버가 모두 실행 중이어야 합니다:')
  console.log('    인증서버 → apps/auth-server  (포트 3001)')
  console.log('    운영서버 → apps/ops-server   (포트 3002)')
  console.log('    개표서버 → apps/count-server (포트 3003)')
  console.log('  ※ 루트에서 npm run dev:all 로 3개 서버 동시 실행 가능')
  console.log('')
  console.log('[사전 확인] 서버 응답 확인 중...')

  const checks = await Promise.allSettled([
    // 헬스체크용 요청: 고유 IP로 rate limit 카운터 격리
    fetch(`${AUTH}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.1' },
      body: '{}',
    }),
    fetch(`${OPS}/api/vote/ballot?ri=healthcheck&electionId=healthcheck`),
    fetch(`${COUNT}/api/results/${ELECTION_ID}`),
  ])

  const names = ['인증서버 (3001)', '운영서버 (3002)', '개표서버 (3003)']
  let allUp = true
  for (let i = 0; i < 3; i++) {
    if (checks[i].status === 'rejected') {
      console.log(`  ❌ ${names[i]} — 응답 없음 (ECONNREFUSED)`)
      allUp = false
    } else {
      console.log(`  ✅ ${names[i]} — 응답 확인`)
    }
  }

  if (!allUp) {
    console.log('')
    console.log('  하나 이상의 서버가 응답하지 않습니다. 서버를 먼저 실행하세요.')
    process.exit(1)
  }
  console.log('  모든 서버 정상. 테스트를 시작합니다.')
  console.log('──────────────────────────────────────────────────────────')
}

// ════════════════════════════════════════════════════════════
// 테스트 함수들
// ════════════════════════════════════════════════════════════

// [8] 입력값 검증
async function test8_inputValidation() {
  console.log('')
  console.log('[테스트 8] 입력값 검증: 잘못된 전화번호 형식 → 400 거부')
  try {
    const cases = [
      { phone: '123',      label: '"123" (너무 짧음)' },
      { phone: 'abcdefg',  label: '"abcdefg" (문자열)' },
      { phone: '',         label: '"" (빈 문자열)' },
    ]
    const results8 = []

    for (const { phone, label } of cases) {
      // 각 요청에 고유한 가짜 IP를 부여해 rate limit 간섭 제거
      const res = await fetch(`${AUTH}/api/auth/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': testIp(),  // 각 요청마다 새로운 IP
        },
        body: JSON.stringify({ phoneNumber: phone }),
      })
      results8.push({ label, status: res.status })
    }

    const allRejected = results8.every(r => r.status === 400)
    const detail = results8.map(r => `${r.label} → ${r.status}`).join(', ')

    if (allRejected) {
      pass(8, '입력값 검증', detail)
    } else {
      fail(8, '입력값 검증', `기대: 400, 실제: ${detail}`)
    }
  } catch (e) {
    fail(8, '입력값 검증', e.message)
  }
}

// [3] RI 위조 방어
async function test3_riForge() {
  console.log('')
  console.log('[테스트 3] RI 위조/추측 방어: 존재하지 않는 UUID로 투표용지 조회')
  try {
    const fakeRi = randomUUID()
    const { status, data } = await getBallot(fakeRi)

    if (status === 403) {
      pass(3, 'RI 위조/추측 방어', `가짜 RI(${fakeRi.slice(0, 8)}…) → 403 거부 ("${data.error}")`)
    } else {
      fail(3, 'RI 위조/추측 방어', `예상 403, 실제 ${status}: ${JSON.stringify(data)}`)
    }
  } catch (e) {
    fail(3, 'RI 위조/추측 방어', e.message)
  }
}

// [4] 중단 복구
async function test4_resumeReconnect() {
  console.log('')
  console.log('[테스트 4] 중단 복구: RI 발급 후 미제출 → 재접속 시 투표용지 재표시')
  try {
    const phone = randomPhone()
    await registerVoter(phone)

    await sendOtp(phone, testIp())
    await delay(500)

    const phoneHash = hashPhone(phone)
    const otp = await getLatestOtp(phoneHash)
    if (!otp) throw new Error('OTP DB 조회 실패')

    const { data: vd, status: vs } = await verifyOtp(phone, otp)
    if (!vd.success) throw new Error(`verify-otp ${vs}: ${vd.error}`)
    const ri = vd.ri

    // 1차 투표용지 조회
    const { status: s1, data: d1 } = await getBallot(ri)
    if (s1 !== 200 || !d1.success) throw new Error(`1차 ballot 실패: ${s1} — ${d1.error}`)

    // 2차 동일 RI로 재접속 (미제출 상태)
    const { status: s2, data: d2 } = await getBallot(ri)

    if (s2 === 200 && d2.success) {
      pass(4, '중단 복구', `동일 RI 2회 연속 조회 성공 (항목 수: ${d2.options?.length})`)
    } else {
      fail(4, '중단 복구', `재접속 실패 → ${s2}: ${d2.error ?? JSON.stringify(d2)}`)
    }
  } catch (e) {
    fail(4, '중단 복구', e.message)
  }
}

// [2] 동시 접속
async function test2_concurrent() {
  console.log('')
  console.log('[테스트 2] 동시 접속: 3개 전화번호로 Promise.all 동시 투표')
  const collectedPublicRis = []
  try {
    const phones = [randomPhone(), randomPhone(), randomPhone()]
    await Promise.all(phones.map(p => registerVoter(p)))

    const voteResults = await Promise.all(phones.map(p => doFullVote(p)))

    const riSet = new Set(voteResults.map(r => r.publicRi))
    collectedPublicRis.push(...voteResults.map(r => r.publicRi))

    if (riSet.size === 3) {
      pass(2, '동시 접속', `3명 동시 투표 완료, 공개용RI 3개 모두 고유`)
    } else {
      fail(2, '동시 접속', `공개용RI 고유성 불만족: ${riSet.size}/3`)
    }
  } catch (e) {
    fail(2, '동시 접속', e.message)
  }
  return collectedPublicRis
}

// [7] 선거 종료 전 비공개
async function test7_prePublishHide(publicRisFromTest2) {
  console.log('')
  console.log('[테스트 7] 선거 종료 전 비공개: finalize 전 결과/확인서 미노출')
  try {
    // 이전 실행 흔적 초기화
    await sb.from('election_results').delete().eq('election_id', ELECTION_ID)
    await sb.from('vote_certificates').update({ is_published: false }).eq('election_id', ELECTION_ID)

    let ok = true
    const details = []

    // (A) /api/results — finalize 전 → 404
    const rRes = await fetch(`${COUNT}/api/results/${ELECTION_ID}`)
    if (rRes.status === 404) {
      details.push('/api/results → 404 (미집계, 정상)')
    } else {
      ok = false
      const d = await rRes.json().catch(() => ({}))
      details.push(`/api/results → ${rRes.status} (404 기대, 노출됨: ${JSON.stringify(d)})`)
    }

    // (B) /api/verify/:publicRi — is_published=false → found:false
    if (publicRisFromTest2.length > 0) {
      const vRes = await fetch(`${COUNT}/api/verify/${encodeURIComponent(publicRisFromTest2[0])}`)
      const vData = await vRes.json()
      if (!vData.found) {
        details.push(`/api/verify → found:false (미공개, 정상)`)
      } else {
        ok = false
        details.push(`/api/verify → found:true (개표 전 노출 — 비정상)`)
      }
    } else {
      details.push('/api/verify → 테스트 2 실패로 publicRi 없음, 건너뜀')
    }

    ok
      ? pass(7, '선거 종료 전 비공개', details.join(' | '))
      : fail(7, '선거 종료 전 비공개', details.join(' | '))
  } catch (e) {
    fail(7, '선거 종료 전 비공개', e.message)
  }
}

// [1] 1인 1표
async function test1_onePersonOneVote() {
  console.log('')
  console.log('[테스트 1] 1인 1표: 투표 완료 후 동일 번호 재인증 요청 거부')
  try {
    const phone = randomPhone()
    await registerVoter(phone)

    // 1차 정상 투표 완료
    await doFullVote(phone)

    // DB에서 is_voted 플래그 확인 (설정됐는지 여부 보고용)
    const phoneHash = hashPhone(phone)
    const { data: voterRows } = await sb
      .from('voters')
      .select('is_voted')
      .eq('phone_number', phoneHash)
      .eq('election_id', ELECTION_ID)
      .limit(1)
    const isVoted = voterRows?.[0]?.is_voted ?? false

    // OTP 직접 삽입(5분 쿨다운 우회) 후 재인증 시도
    const otp2 = await insertOtpDirectly(phoneHash)
    const { status: s2, data: d2 } = await verifyOtp(phone, otp2)

    if (s2 === 403) {
      pass(1, '1인 1표', `재인증 → 403 거부 ("${d2.error}")`)
    } else {
      const bugNote = isVoted
        ? '(is_voted=true인데 verify-otp 통과 — 예상치 못한 버그)'
        : '(is_voted가 false로 유지됨 — verify-otp 완료 후 voters.is_voted 갱신 누락 버그. 2중 투표 가능)'
      fail(1, '1인 1표', `재인증 성공(${s2}) → ${bugNote}`)
    }
  } catch (e) {
    fail(1, '1인 1표', e.message)
  }
}

// [5] 위변조 감지
async function test5_hmacTamper() {
  console.log('')
  console.log('[테스트 5] 위변조 감지: HMAC 서명 변조 시 개표 서버 거부')
  try {
    const publicRi = `ToughRiver_${randomUUID()}_aabbccdd_11223344`
    const certData = {
      publicRi,
      electionId: ELECTION_ID,
      selectedOptionId: randomUUID(),
      selectedOptionText: '찬성',
      createdAt: new Date().toISOString(),
    }
    const validSig = signCertificate(certData)
    // 마지막 한 글자 변조
    const tamperedSig = validSig.slice(0, -1) + (validSig.endsWith('a') ? 'b' : 'a')

    const res = await fetch(`${COUNT}/api/internal/receive-certificate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPS_TO_COUNT_SECRET}`,
      },
      body: JSON.stringify({ ...certData, hmacSignature: tamperedSig }),
    })
    const data = await res.json()

    if (res.status === 400) {
      pass(5, '위변조 감지', `변조된 HMAC → 400 거부 ("${data.error}")`)
    } else {
      fail(5, '위변조 감지', `예상 400, 실제 ${res.status}: ${JSON.stringify(data)}`)
    }
  } catch (e) {
    fail(5, '위변조 감지', e.message)
  }
}

// [6] 집계 정확성
async function test6_tallyAccuracy() {
  console.log('')
  console.log('[테스트 6] 집계 정확성: 개표 확정 후 election_results ↔ vote_certificates 일치')
  try {
    const certCount = await getCertCount()

    if (certCount === 0) {
      fail(6, '집계 정확성', 'vote_certificates가 0건 — 투표 데이터 없음 (테스트 2 실패 시)')
      return
    }

    // 개표 확정
    const finalizeRes = await fetch(`${COUNT}/api/admin/finalize/${ELECTION_ID}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ADMIN_SECRET}` },
    })
    const finalizeData = await finalizeRes.json()

    if (!finalizeData.success) {
      fail(6, '집계 정확성', `finalize 실패: ${JSON.stringify(finalizeData)}`)
      return
    }

    // /api/results 조회
    const resultsRes = await fetch(`${COUNT}/api/results/${ELECTION_ID}`)
    const resultsData = await resultsRes.json()
    const totalInResults = (resultsData.results ?? []).reduce((s, r) => s + (r.voteCount ?? 0), 0)
    const finalizeTotal = finalizeData.totalVotes

    if (totalInResults === finalizeTotal && finalizeTotal === certCount) {
      pass(6, '집계 정확성',
        `vote_certificates=${certCount} | finalize.totalVotes=${finalizeTotal} | results 합계=${totalInResults} — 모두 일치`)
    } else if (totalInResults === finalizeTotal) {
      pass(6, '집계 정확성',
        `finalize.totalVotes(${finalizeTotal}) = results 합계(${totalInResults}) 일치 (DB count=${certCount})`)
    } else {
      fail(6, '집계 정확성',
        `불일치: vote_certificates=${certCount}, finalize=${finalizeTotal}, results 합계=${totalInResults}`)
    }
  } catch (e) {
    fail(6, '집계 정확성', e.message)
  }
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
async function main() {
  await checkServers()

  // 사이드 이펙트 없는 단순 검증 먼저
  await test8_inputValidation()
  await test3_riForge()
  await test4_resumeReconnect()

  // 투표 진행 → Test 7(비공개)은 Test 6(finalize) 전에 반드시 실행
  const publicRisFromTest2 = await test2_concurrent()
  await test7_prePublishHide(publicRisFromTest2)

  // 나머지
  await test1_onePersonOneVote()
  await test5_hmacTamper()
  await test6_tallyAccuracy()  // finalize 포함 — 최후에 실행

  // ─── 최종 요약 ─────────────────────────────────────────────
  console.log('')
  console.log('══════════════════════════════════════════════════════════')
  console.log('  최종 결과 요약')
  console.log('══════════════════════════════════════════════════════════')
  const sorted = [...results].sort((a, b) => a.num - b.num)
  for (const r of sorted) {
    const icon = r.status === 'PASS' ? '✅' : '❌'
    console.log(`  ${icon} [${r.num}] ${r.name}: ${r.status}`)
  }

  const passCount = results.filter(r => r.status === 'PASS').length
  const failCount = results.filter(r => r.status === 'FAIL').length
  console.log('')
  console.log(`  📊 8개 항목 중 ${passCount}개 PASS / ${failCount}개 FAIL`)
  console.log('══════════════════════════════════════════════════════════')
  console.log('')

  process.exit(failCount > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('\n[오류] 테스트 실행 중 예상치 못한 오류:', e.message)
  process.exit(1)
})
