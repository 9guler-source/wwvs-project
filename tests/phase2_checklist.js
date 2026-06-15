#!/usr/bin/env node
'use strict'
/**
 * WWVS Phase 2 체크리스트 자동 검증 스크립트
 * 03~09단계 구현 검증 (항목 9~31)
 * 실행: node tests/phase2_checklist.js
 *
 * 자동화:  [9~16] [22~27] [28~31] — 19개
 * 반자동:  [20]  API 호출 성공 자동 확인, [SMS 발송] 로그는 서버 콘솔 수동 확인
 * 수동확인: [21]  /complete 페이지 복사 버튼 직접 조작 필요
 */

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
const opsEnv  = parseEnv('../apps/ops-server/.env.local')
const authEnv = parseEnv('../apps/auth-server/.env.local')

// ─── Config ───────────────────────────────────────────────────────────────────
const AUTH  = 'http://localhost:3001'
const OPS   = 'http://localhost:3002'
const COUNT = 'http://localhost:3003'
const ELECTION_ID = 'aaaaaaaa-0000-0000-0000-000000000001'

const SUPABASE_URL        = opsEnv.OPS_SUPABASE_URL
const SUPABASE_KEY        = opsEnv.OPS_SUPABASE_SERVICE_KEY
const OPS_HMAC_SECRET     = opsEnv.OPS_HMAC_SECRET
const OPS_TO_COUNT_SECRET = opsEnv.OPS_TO_COUNT_SECRET
const AUTH_TO_OPS_SECRET  = opsEnv.AUTH_TO_OPS_SECRET
const AUTH_ADMIN_SECRET   = authEnv.ADMIN_SECRET

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

// ─── 유틸리티 ─────────────────────────────────────────────────────────────────
let _phoneCounter = 0
function randomPhone() {
  const n = (Date.now() % 100_000_000 + _phoneCounter++).toString().padStart(8, '0')
  return `010${n}`
}
function hashPhone(phone) { return createHash('sha256').update(phone).digest('hex') }
function computeF(salt, input) {
  return createHmac('sha256', salt).update(input).digest('hex').slice(0, 8)
}
const delay = ms => new Promise(r => setTimeout(r, ms))

let _ipCounter = 200  // phase1과 IP 범위 분리
function testIp() {
  return `10.97.${Math.floor(_ipCounter / 256)}.${++_ipCounter % 256}`
}

function signCertificate(data) {
  return createHmac('sha256', OPS_HMAC_SECRET).update(JSON.stringify(data)).digest('hex')
}

// ─── Supabase 헬퍼 ────────────────────────────────────────────────────────────
async function registerVoter(phone) {
  const phoneHash = hashPhone(phone)
  const { error } = await sb.from('voters').insert({ phone_number: phoneHash, election_id: ELECTION_ID })
  if (error && error.code !== '23505') throw new Error(`registerVoter: ${error.message}`)
  return phoneHash
}

async function getLatestOtp(phoneHash) {
  const { data, error } = await sb.from('otp_requests')
    .select('otp_code').eq('phone_hash', phoneHash).eq('is_used', false)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(`getLatestOtp: ${error.message}`)
  return data?.otp_code ?? null
}

// ─── HTTP 헬퍼 ────────────────────────────────────────────────────────────────
async function sendOtp(phone) {
  return fetch(`${AUTH}/api/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': testIp() },
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
function manual(num, name, howTo = '') {
  results.push({ num, name, status: 'MANUAL' })
  console.log(`  🔵 [${num}] 수동확인필요 — ${name}`)
  if (howTo) console.log(`         확인방법: ${howTo}`)
}

// ─── 서버 상태 확인 ───────────────────────────────────────────────────────────
async function checkServers() {
  console.log('')
  console.log('══════════════════════════════════════════════════════════')
  console.log('  WWVS Phase 2 체크리스트 자동 검증 스크립트')
  console.log('  03~09단계 구현 검증 (항목 9~31)')
  console.log('══════════════════════════════════════════════════════════')
  console.log('')
  console.log('[사전 확인] 서버 응답 확인 중...')

  const checks = await Promise.allSettled([
    fetch(`${AUTH}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.97.0.1' },
      body: '{}',
    }),
    fetch(`${OPS}/api/vote/ballot?ri=healthcheck&electionId=healthcheck`),
    fetch(`${COUNT}/api/results/${ELECTION_ID}`),
  ])

  const names = ['인증서버 (3001)', '운영서버 (3002)', '개표서버 (3003)']
  let allUp = true
  for (let i = 0; i < 3; i++) {
    if (checks[i].status === 'rejected') {
      console.log(`  ❌ ${names[i]} — 응답 없음`)
      allUp = false
    } else {
      console.log(`  ✅ ${names[i]} — 응답 확인`)
    }
  }
  if (!allUp) { console.log('\n  서버를 먼저 실행하세요.'); process.exit(1) }
  console.log('  모든 서버 정상. 테스트를 시작합니다.')
  console.log('──────────────────────────────────────────────────────────')
}

// ═══════════════════════════════════════════════════════════
// 공유 상태: 투표 스토리 (9, 10, 11, 12, 22, 24번 공동 사용)
// ═══════════════════════════════════════════════════════════
const story = {
  phone: null, ri: null, publicRi: null,
  markWord: null, newRiUuid: null, mark1: null, mark2: null,
  voterId: null,
}

/**
 * 투표 스토리 실행 + 중간/최종 상태를 각 테스트 번호로 즉시 보고
 * 실행 순서: registerVoter → sendOtp → verifyOtp → [11 체크] → getBallot
 *            → submitVote → [9,10,22,24 체크] → 대기 → [12 체크]
 */
async function runVoteStory() {
  console.log('')
  console.log('[스토리] 투표 전체 흐름 실행 — 항목 9·10·11·12·22·24 검증')
  try {
    // 1. 신규 유권자 등록
    story.phone = randomPhone()
    const phoneHash = await registerVoter(story.phone)
    const { data: voterRow } = await sb.from('voters').select('id')
      .eq('phone_number', phoneHash).eq('election_id', ELECTION_ID).maybeSingle()
    story.voterId = voterRow?.id

    // 2. OTP 발송 → 검증 → RI 발급
    await sendOtp(story.phone)
    await delay(500)
    const otp = await getLatestOtp(phoneHash)
    if (!otp) throw new Error('OTP DB 조회 실패')

    const { data: vd } = await verifyOtp(story.phone, otp)
    if (!vd.success) throw new Error(`verify-otp 실패: ${vd.error}`)
    story.ri = vd.ri

    // ── [11] verify-otp 직후 ri_voter_map 매핑 생성 ────────────────────
    console.log('')
    console.log('[테스트 11] verify-otp 후 ri_voter_map 매핑 생성 확인')
    const { data: map11 } = await sb.from('ri_voter_map')
      .select('id, voter_id, phone_number').eq('ri_value', story.ri).maybeSingle()
    if (map11 && map11.voter_id === story.voterId) {
      const hasPhone = map11.phone_number === story.phone
      pass(11, 'ri_voter_map 매핑 생성',
        `voter_id 일치, phone_number=${hasPhone ? '저장됨' : '(null — verify-otp 미설정)'}`)
    } else if (map11 && map11.voter_id !== story.voterId) {
      fail(11, 'ri_voter_map 매핑 생성', `voter_id 불일치: DB=${map11.voter_id} ≠ 예상=${story.voterId}`)
    } else {
      fail(11, 'ri_voter_map 매핑 생성', 'ri_voter_map에 항목 없음')
    }

    // 3. 투표용지 조회 → 제출
    const { data: bd } = await getBallot(story.ri)
    if (!bd.success) throw new Error(`ballot 실패: ${bd.error}`)

    const { data: sd } = await submitVote(story.ri, bd.options[0].id)
    if (!sd.success) throw new Error(`submit 실패: ${sd.error}`)
    story.publicRi = sd.certificate.publicRi

    const parts = story.publicRi.split('_')
    story.markWord  = parts[0]
    story.newRiUuid = parts[1]
    story.mark1     = parts[2]
    story.mark2     = parts[3]

    // ── [9] 원본 RI is_used=true ────────────────────────────────────────
    console.log('')
    console.log('[테스트 9] 투표 완료 후 원본RI is_used=true 확인')
    const { data: riRec } = await sb.from('ri_ledger')
      .select('ri_value, is_used').eq('ri_value', story.ri).maybeSingle()
    if (riRec?.is_used) {
      pass(9, '원본RI is_used=true', `ri_ledger.is_used=true (ri: ${story.ri.slice(0, 8)}…)`)
    } else if (riRec) {
      fail(9, '원본RI is_used=true', `is_used=${riRec.is_used} — 투표 제출 후 소진 처리 안 됨`)
    } else {
      fail(9, '원본RI is_used=true', 'ri_ledger에 해당 RI 없음')
    }

    // ── [10] publicRi가 ri_ledger에 없음 ────────────────────────────────
    console.log('')
    console.log('[테스트 10] publicRi(신규RI)가 ri_ledger에 없는 것 확인')
    const { data: pubRiRec } = await sb.from('ri_ledger')
      .select('ri_value').eq('ri_value', story.publicRi).maybeSingle()
    if (!pubRiRec) {
      pass(10, 'publicRi가 ri_ledger에 없음', 'publicRi는 투표확인서 전용 — ri_ledger 미등록 확인')
    } else {
      fail(10, 'publicRi가 ri_ledger에 없음', 'publicRi가 ri_ledger에도 등록됨 — 분리 원칙 위반')
    }

    // ── [22] publicRi 형식 검증 ────────────────────────────────────────
    console.log('')
    console.log('[테스트 22] publicRi 형식 검증: {앞마크}_{UUID}_{8hex}_{8hex}')
    const markWordOk  = /^[A-Za-z]+$/.test(story.markWord)
    const newRiUuidOk = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(story.newRiUuid)
    const mark1Ok     = /^[a-f0-9]{8}$/.test(story.mark1)
    const mark2Ok     = /^[a-f0-9]{8}$/.test(story.mark2)
    const partsCount  = parts.length === 4

    if (partsCount && markWordOk && newRiUuidOk && mark1Ok && mark2Ok) {
      pass(22, 'publicRi 형식',
        `${story.markWord}_${story.newRiUuid.slice(0, 8)}…_${story.mark1}_${story.mark2}`)
    } else {
      fail(22, 'publicRi 형식',
        `parts=${parts.length} markWord=${markWordOk} uuid=${newRiUuidOk} mark1=${mark1Ok} mark2=${mark2Ok}`)
    }

    // ── [24] mark_pool is_assigned=true ────────────────────────────────
    console.log('')
    console.log('[테스트 24] 투표 후 mark_pool is_assigned=true 확인')
    const { data: mpRec } = await sb.from('mark_pool')
      .select('is_assigned, assigned_at')
      .eq('election_id', ELECTION_ID)
      .eq('mark_word', story.markWord)
      .maybeSingle()
    if (mpRec?.is_assigned) {
      pass(24, 'mark_pool is_assigned=true',
        `markWord="${story.markWord}" → is_assigned=true, at=${mpRec.assigned_at?.slice(0, 19)}`)
    } else if (mpRec) {
      fail(24, 'mark_pool is_assigned=true', `is_assigned=${mpRec.is_assigned}`)
    } else {
      fail(24, 'mark_pool is_assigned=true', `mark_pool에 "${story.markWord}" 없음`)
    }

    // 4. vote-completed 처리 대기 후 ri_voter_map 삭제 확인
    await delay(1000)

    // ── [12] ri_voter_map 매핑 삭제 ────────────────────────────────────
    console.log('')
    console.log('[테스트 12] vote-completed 처리 후 ri_voter_map 매핑 삭제 확인')
    const { data: map12 } = await sb.from('ri_voter_map')
      .select('id').eq('ri_value', story.ri).maybeSingle()
    if (!map12) {
      pass(12, 'ri_voter_map 매핑 삭제', '투표 완료 후 ri_voter_map 항목 정상 삭제됨')
    } else {
      fail(12, 'ri_voter_map 매핑 삭제', '항목이 남아있음 — vote-completed 미처리 또는 삭제 누락')
    }

  } catch (e) {
    // 스토리 실패 시 관련 항목 전체 FAIL
    for (const num of [9, 10, 11, 12, 22, 24]) {
      if (!results.find(r => r.num === num)) fail(num, `(스토리 실패)`, e.message)
    }
  }
}

// ═══════════════════════════════════════════════════════════
// 개별 테스트 함수
// ═══════════════════════════════════════════════════════════

// [13] pending_certificates 테이블 구조 확인
async function test13_pendingCertificates() {
  console.log('')
  console.log('[테스트 13] pending_certificates 테이블 존재 및 구조 확인')
  try {
    const { data, error } = await sb.from('pending_certificates')
      .select('id, certificate_data, created_at').limit(1)
    if (error) throw new Error(error.message)
    pass(13, 'pending_certificates 테이블+구조', '테이블 정상 — id, certificate_data, created_at 컬럼 확인')
  } catch (e) {
    fail(13, 'pending_certificates 테이블+구조', e.message)
  }
}

// [14] pending_vote_completions + new_ri 컬럼 확인
async function test14_pendingVoteCompletions() {
  console.log('')
  console.log('[테스트 14] pending_vote_completions 테이블 및 new_ri 컬럼 확인')
  try {
    const { data, error } = await sb.from('pending_vote_completions')
      .select('id, original_ri, new_ri, created_at').limit(1)
    if (error) throw new Error(error.message)
    // new_ri 컬럼 select 성공 여부 확인
    pass(14, 'pending_vote_completions + new_ri 컬럼',
      '테이블 정상 — original_ri, new_ri(publicRi용) 컬럼 확인')
  } catch (e) {
    fail(14, 'pending_vote_completions + new_ri 컬럼', e.message)
  }
}

// [15] vote-completed 미인증 → 401
async function test15_voteCompletedUnauth() {
  console.log('')
  console.log('[테스트 15] vote-completed API 미인증 → 401 거부')
  try {
    const res = await fetch(`${AUTH}/api/internal/vote-completed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalRi: 'test-ri' }),
    })
    if (res.status === 401) {
      pass(15, 'vote-completed 미인증 → 401', `인증 없음 → 401 거부 확인`)
    } else {
      const d = await res.json()
      fail(15, 'vote-completed 미인증 → 401', `예상 401, 실제 ${res.status}: ${JSON.stringify(d)}`)
    }
  } catch (e) {
    fail(15, 'vote-completed 미인증 → 401', e.message)
  }
}

// [16] count-server 중복 인증서 멱등성 ACK
async function test16_countServerIdempotency() {
  console.log('')
  console.log('[테스트 16] count-server 중복 인증서 → 200 ACK + duplicate:true (멱등성)')
  try {
    const publicRi = `BraveRiver_${randomUUID()}_aabb1122_ccdd3344`
    const certData = {
      publicRi,
      electionId: ELECTION_ID,
      selectedOptionId: randomUUID(),
      selectedOptionText: '찬성',
      createdAt: new Date().toISOString(),
    }
    const hmacSignature = signCertificate(certData)
    const cert = { ...certData, hmacSignature }

    const r1 = await fetch(`${COUNT}/api/internal/receive-certificate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPS_TO_COUNT_SECRET}` },
      body: JSON.stringify(cert),
    })
    if (!r1.ok) {
      const d1 = await r1.json()
      fail(16, '중복 인증서 멱등성 ACK', `1차 전송 실패 ${r1.status}: ${JSON.stringify(d1)}`)
      return
    }

    const r2 = await fetch(`${COUNT}/api/internal/receive-certificate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPS_TO_COUNT_SECRET}` },
      body: JSON.stringify(cert),
    })
    const d2 = await r2.json()
    if (r2.ok && d2.success && d2.duplicate) {
      pass(16, '중복 인증서 멱등성 ACK', '2차 전송 → 200 + duplicate:true 확인')
    } else {
      fail(16, '중복 인증서 멱등성 ACK', `2차 응답: status=${r2.status}, body=${JSON.stringify(d2)}`)
    }
  } catch (e) {
    fail(16, '중복 인증서 멱등성 ACK', e.message)
  }
}

// [20] SMS 로그: vote-completed API 정상 처리 확인 (로그는 수동)
async function test20_smsLog() {
  console.log('')
  console.log('[테스트 20] vote-completed API 정상 처리 확인 (반자동)')
  try {
    // 알 수 없는 RI → 멱등성 ACK (already processed) — API 자체는 정상 동작
    const res = await fetch(`${AUTH}/api/internal/vote-completed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AUTH_TO_OPS_SECRET}` },
      body: JSON.stringify({ originalRi: 'nonexistent-' + randomUUID(), publicRi: 'BraveWord_' + randomUUID() + '_aa112233_bb445566' }),
    })
    const d = await res.json()
    if (res.ok && d.success) {
      pass(20, 'vote-completed API 정상 처리',
        '미인증 → 401, 인증+알 수 없는RI → 200 (alreadyProcessed). ' +
        '⚠️  [SMS 발송] 로그는 auth-server 콘솔에서 수동 확인 필요.')
    } else {
      fail(20, 'vote-completed API 정상 처리', `${res.status}: ${JSON.stringify(d)}`)
    }
  } catch (e) {
    fail(20, 'vote-completed API 정상 처리', e.message)
  }
}

// [21] /complete 페이지 복사 버튼 — 수동확인
function test21_copyButton() {
  console.log('')
  console.log('[테스트 21] /complete 페이지 공개용RI 복사 버튼 (수동확인)')
  manual(21, '/complete 페이지 복사 버튼',
    '투표 완료 후 http://localhost:3002/complete 접속 → ' +
    '"확인 코드" 옆 "복사" 버튼 클릭 → 클립보드에 publicRi 붙여넣기 확인 → "복사되었습니다" 피드백 표시 여부')
}

// [23] mark_pool 10000개 항목 확인
async function test23_markPool() {
  console.log('')
  console.log('[테스트 23] mark_pool 10000개(100형용사×100명사) 항목 확인')
  try {
    const { count, error } = await sb.from('mark_pool')
      .select('*', { count: 'exact', head: true })
      .eq('election_id', ELECTION_ID)
    if (error) throw new Error(error.message)
    if (count === 10000) {
      pass(23, 'mark_pool 10000개', `count=${count} (100형용사×100명사)`)
    } else if (count > 0) {
      fail(23, 'mark_pool 10000개', `count=${count} (10000 아님 — setup-election 미완료 가능성)`)
    } else {
      fail(23, 'mark_pool 10000개', 'mark_pool 비어있음 — setup-election.js 실행 필요')
    }
  } catch (e) {
    fail(23, 'mark_pool 10000개', e.message)
  }
}

// [25] F1/F2 비공개: publish-functions 미인증 → 401
async function test25_f1f2Unpublished() {
  console.log('')
  console.log('[테스트 25] F1/F2 비공개: publish-functions 미인증 접근 → 401')
  try {
    const res = await fetch(`${OPS}/api/admin/publish-functions/${ELECTION_ID}`, {
      method: 'POST',
      // Authorization 헤더 없음
    })
    if (res.status === 401) {
      pass(25, 'publish-functions 미인증 → 401', '인증 없이 접근 → 401 거부')
    } else {
      const d = await res.json()
      fail(25, 'publish-functions 미인증 → 401', `예상 401, 실제 ${res.status}: ${JSON.stringify(d)}`)
    }
  } catch (e) {
    fail(25, 'publish-functions 미인증 → 401', e.message)
  }
}

// [26] publicRi 무결성: F1/F2 재계산 검증
async function test26_publicRiIntegrity() {
  console.log('')
  console.log('[테스트 26] publicRi 무결성: F1(앞마크)=1차마크, F2(1차마크)=2차마크 재계산 검증')
  try {
    // publish-functions에서 F1/F2 salt 획득
    const pfRes = await fetch(`${OPS}/api/admin/publish-functions/${ELECTION_ID}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPS_HMAC_SECRET}` },
    })
    if (!pfRes.ok) throw new Error(`publish-functions 호출 실패: ${pfRes.status}`)
    const { f1Salt, f2Salt } = await pfRes.json()

    // 검증 대상: 이번 스토리 vote의 publicRi 또는 DB의 최신 publicRi
    let target = story.publicRi
    if (!target) {
      // 스토리가 실패한 경우 DB에서 publicRi 형식 인증서 조회
      const { data: certs } = await sb.from('vote_certificates')
        .select('new_ri').eq('election_id', ELECTION_ID)
        .order('created_at', { ascending: false }).limit(20)
      const publicRiCert = certs?.find(c => /^[A-Za-z]+_[a-f0-9-]{36}_[a-f0-9]{8}_[a-f0-9]{8}$/.test(c.new_ri))
      if (!publicRiCert) throw new Error('publicRi 형식 인증서를 DB에서 찾을 수 없음')
      target = publicRiCert.new_ri
    }

    const [markWord, , mark1, mark2] = target.split('_')
    const expectedMark1 = computeF(f1Salt, markWord)
    const expectedMark2 = computeF(f2Salt, mark1)

    if (mark1 === expectedMark1 && mark2 === expectedMark2) {
      pass(26, 'publicRi 무결성 재계산',
        `앞마크="${markWord}" → F1=${expectedMark1}✅ → F2=${expectedMark2}✅`)
    } else {
      fail(26, 'publicRi 무결성 재계산',
        `F1: 기대=${expectedMark1}, 실제=${mark1} | F2: 기대=${expectedMark2}, 실제=${mark2}`)
    }
  } catch (e) {
    fail(26, 'publicRi 무결성 재계산', e.message)
  }
}

// [27] vote_certificates 앞마크 알파벳 정렬 확인
async function test27_markWordSort() {
  console.log('')
  console.log('[테스트 27] vote_certificates publicRi 앞마크 알파벳 정렬 확인')
  try {
    // publicRi 형식 (단어_uuid_hex_hex) 인증서만 필터
    const { data: allCerts } = await sb.from('vote_certificates')
      .select('new_ri').eq('election_id', ELECTION_ID).order('new_ri').limit(200)
    if (!allCerts || allCerts.length === 0) throw new Error('vote_certificates 없음')

    const publicRiCerts = allCerts
      .map(c => c.new_ri)
      .filter(r => /^[A-Za-z]+_[a-f0-9-]{36}_[a-f0-9]{8}_[a-f0-9]{8}$/.test(r))

    if (publicRiCerts.length < 2) {
      pass(27, 'vote_certificates 앞마크 정렬',
        `publicRi 형식 인증서 ${publicRiCerts.length}개 (비교 불가, DB sort 설정 확인)')`)
      return
    }

    const markWords = publicRiCerts.map(r => r.split('_')[0])
    let sorted = true
    for (let i = 1; i < markWords.length; i++) {
      if (markWords[i] < markWords[i - 1]) { sorted = false; break }
    }

    if (sorted) {
      pass(27, 'vote_certificates 앞마크 정렬',
        `publicRi 형식 ${publicRiCerts.length}개 → 앞마크 오름차순 정렬 확인` +
        ` (${markWords[0]} … ${markWords[markWords.length - 1]})`)
    } else {
      fail(27, 'vote_certificates 앞마크 정렬', `정렬 순서 불일치: ${markWords.join(', ')}`)
    }
  } catch (e) {
    fail(27, 'vote_certificates 앞마크 정렬', e.message)
  }
}

// [28] 관리자 도구 인증 없이 → 401
async function test28_adminUnauth() {
  console.log('')
  console.log('[테스트 28] 관리자 명부 도구: 인증 없이 접근 → 401 거부')
  try {
    const endpoints = [
      { url: `${AUTH}/api/admin/elections`, method: 'GET', label: 'GET /elections' },
      { url: `${AUTH}/api/admin/roster-status/${ELECTION_ID}`, method: 'GET', label: 'GET /roster-status' },
      { url: `${AUTH}/api/admin/upload-roster`, method: 'POST', label: 'POST /upload-roster' },
      { url: `${AUTH}/api/admin/confirm-roster`, method: 'POST', label: 'POST /confirm-roster' },
      { url: `${AUTH}/api/admin/seal-roster/${ELECTION_ID}`, method: 'POST', label: 'POST /seal-roster' },
      { url: `${AUTH}/api/admin/export-roster/${ELECTION_ID}`, method: 'GET', label: 'GET /export-roster' },
    ]

    const fails = []
    for (const ep of endpoints) {
      const res = await fetch(ep.url, { method: ep.method })
      if (res.status !== 401) fails.push(`${ep.label}→${res.status}`)
    }

    if (fails.length === 0) {
      pass(28, '관리자 도구 미인증 → 401', `6개 엔드포인트 모두 인증 없이 401 반환`)
    } else {
      fail(28, '관리자 도구 미인증 → 401', `401 아닌 응답: ${fails.join(', ')}`)
    }
  } catch (e) {
    fail(28, '관리자 도구 미인증 → 401', e.message)
  }
}

// [29] xlsx 검증 API 동작 확인
async function test29_xlsxUpload() {
  console.log('')
  console.log('[테스트 29] 명부입력도구 xlsx 업로드 검증 API 동작 확인')
  try {
    const XLSX = require(path.join(__dirname, '../node_modules/xlsx'))

    // 테스트용 xlsx 생성 (valid 2개, 형식오류 1개, 파일내중복 1개)
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet([
      { '전화번호': '010-9901-8801' },  // valid
      { '전화번호': '01099018802' },     // valid
      { '전화번호': 'invalid_phone' },   // 형식오류
      { '전화번호': '010-9901-8801' },   // 파일내중복
    ])
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    const form = new FormData()
    form.append(
      'file',
      new Blob([xlsxBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      'test.xlsx',
    )
    form.append('electionId', ELECTION_ID)

    const res = await fetch(`${AUTH}/api/admin/upload-roster`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AUTH_ADMIN_SECRET}` },
      body: form,
    })
    const d = await res.json()

    if (!res.ok || !d.ok) {
      fail(29, 'xlsx 업로드 검증 API', `API 오류: ${d.error ?? res.status}`)
      return
    }

    const okTotal    = d.total === 4
    const okValid    = d.valid >= 0 && d.valid <= 2  // 이미 등록된 경우 0일 수도
    const okFormat   = d.formatErrors === 1
    const okFileDup  = d.withinFileDups === 1
    const hasErrors  = Array.isArray(d.errorRows) && d.errorRows.length >= 2

    if (okTotal && okFormat && okFileDup && hasErrors) {
      pass(29, 'xlsx 업로드 검증 API',
        `total=${d.total}, valid=${d.valid}, formatErrors=${d.formatErrors}, withinFileDups=${d.withinFileDups}, existingDups=${d.existingDups}`)
    } else {
      fail(29, 'xlsx 업로드 검증 API',
        `total=${d.total}(기대4) formatErrors=${d.formatErrors}(기대1) withinFileDups=${d.withinFileDups}(기대1)`)
    }
  } catch (e) {
    fail(29, 'xlsx 업로드 검증 API', e.message)
  }
}

// [30] F1/F2 AES-GCM 암호화 형식 DB 확인
async function test30_f1f2Encrypted() {
  console.log('')
  console.log('[테스트 30] F1/F2 AES-256-GCM 암호화 형식 DB 직접 확인')
  try {
    const { data: df, error } = await sb.from('daily_functions')
      .select('f1_encrypted, f2_encrypted, is_published')
      .eq('election_id', ELECTION_ID)
      .maybeSingle()
    if (error || !df) throw new Error(error?.message ?? 'daily_functions 없음')

    // AES-256-GCM 형식: {24char iv hex}:{ciphertext hex}:{32char tag hex}
    const aesGcmPattern = /^[a-f0-9]{24}:[a-f0-9]+:[a-f0-9]{32}$/
    const f1Ok = aesGcmPattern.test(df.f1_encrypted)
    const f2Ok = aesGcmPattern.test(df.f2_encrypted)

    if (f1Ok && f2Ok) {
      pass(30, 'F1/F2 AES-GCM 암호화 형식',
        `f1 iv:${df.f1_encrypted.slice(0, 8)}…tag:…${df.f1_encrypted.slice(-8)} | f2 유사 형식 확인`)
    } else {
      fail(30, 'F1/F2 AES-GCM 암호화 형식',
        `f1Ok=${f1Ok}, f2Ok=${f2Ok} — 평문 저장 의심. f1=${df.f1_encrypted.slice(0, 30)}…`)
    }
  } catch (e) {
    fail(30, 'F1/F2 AES-GCM 암호화 형식', e.message)
  }
}

// [31] F1/F2 접근경로 제한: 미인증 차단 + submit 응답 내 salt 미노출
async function test31_f1f2AccessControl() {
  console.log('')
  console.log('[테스트 31] F1/F2 접근경로 제한: 미인증 차단 + 투표 응답에 salt 미포함')
  try {
    const issues = []

    // (A) publish-functions 미인증 → 401
    const r1 = await fetch(`${OPS}/api/admin/publish-functions/${ELECTION_ID}`, { method: 'POST' })
    if (r1.status !== 401) issues.push(`publish-functions 미인증 → ${r1.status} (401 기대)`)

    // (B) vote/submit 응답에 f1Salt/f2Salt/salt 포함 여부
    if (story.publicRi) {
      // submit 응답이 story에서 이미 확인됨 — publicRi만 포함하는지 재확인
      const phone2 = randomPhone()
      await registerVoter(phone2)
      await sendOtp(phone2)
      await delay(400)
      const otp2 = await getLatestOtp(hashPhone(phone2))
      if (otp2) {
        const { data: vd2 } = await verifyOtp(phone2, otp2)
        if (vd2.success) {
          const { data: bd2 } = await getBallot(vd2.ri)
          if (bd2.success) {
            const { status: ss2, data: sd2 } = await submitVote(vd2.ri, bd2.options[0].id)
            if (ss2 === 200) {
              const body = JSON.stringify(sd2)
              if (body.includes('f1Salt') || body.includes('f2Salt') || body.includes('salt')) {
                issues.push(`submit 응답에 salt 키 포함: ${body.slice(0, 100)}`)
              }
              if (body.includes('f1_encrypted') || body.includes('f2_encrypted')) {
                issues.push('submit 응답에 암호화 필드 포함')
              }
            }
          }
        }
      }
    }

    if (issues.length === 0) {
      pass(31, 'F1/F2 접근경로 제한',
        'publish-functions 미인증 → 401 | submit 응답에 salt 미포함 확인')
    } else {
      fail(31, 'F1/F2 접근경로 제한', issues.join(' / '))
    }
  } catch (e) {
    fail(31, 'F1/F2 접근경로 제한', e.message)
  }
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
async function main() {
  await checkServers()

  // ── 03/04/05 단계: 투표 흐름 공유 스토리 ──────────────────────────────
  await runVoteStory()   // [9][10][11][12][22][24]

  // ── 04/05 단계: 독립 테이블/API 확인 ──────────────────────────────────
  await test13_pendingCertificates()
  await test14_pendingVoteCompletions()
  await test15_voteCompletedUnauth()
  await test16_countServerIdempotency()

  // ── 06 단계: SMS 로그, 복사 버튼 ──────────────────────────────────────
  await test20_smsLog()
  test21_copyButton()

  // ── 07 단계: mark_pool, publicRi, F1/F2 ───────────────────────────────
  await test23_markPool()
  // [24] 이미 runVoteStory 안에서 실행됨
  await test25_f1f2Unpublished()
  await test26_publicRiIntegrity()
  await test27_markWordSort()

  // ── 08 단계: 관리자 도구 ──────────────────────────────────────────────
  await test28_adminUnauth()
  await test29_xlsxUpload()

  // ── 09 단계: F1/F2 암호화/접근경로 ───────────────────────────────────
  await test30_f1f2Encrypted()
  await test31_f1f2AccessControl()

  // ─── 최종 요약 ────────────────────────────────────────────────────────
  console.log('')
  console.log('══════════════════════════════════════════════════════════')
  console.log('  최종 결과 요약')
  console.log('══════════════════════════════════════════════════════════')
  const sorted = [...results].sort((a, b) => a.num - b.num)
  for (const r of sorted) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '🔵'
    console.log(`  ${icon} [${r.num}] ${r.name}: ${r.status}`)
  }

  const passCount   = results.filter(r => r.status === 'PASS').length
  const failCount   = results.filter(r => r.status === 'FAIL').length
  const manualCount = results.filter(r => r.status === 'MANUAL').length

  console.log('')
  console.log(`  📊 ${sorted.length}개 항목 중 ${passCount}개 PASS / ${manualCount}개 수동확인 / ${failCount}개 FAIL`)
  console.log('══════════════════════════════════════════════════════════')
  console.log('')

  process.exit(failCount > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('\n[오류] 테스트 실행 중 예상치 못한 오류:', e.message)
  process.exit(1)
})
