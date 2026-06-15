'use strict'
// 시뮬레이션 테스트용 선거 준비 스크립트
// 고정 선거 ID: aaaaaaaa-0000-0000-0000-000000000001
// 유권자: 010-7777-7777 (1명)
// 항목: 찬성/반대

const { createHash } = require('crypto')
const path = require('path')
const { createClient } = require(path.join(__dirname, '../node_modules/@supabase/supabase-js'))

const fs = require('fs')
const envPath = path.join(__dirname, '../apps/ops-server/.env.local')
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([A-Z_]+)=(.+)$/)
  if (m) process.env[m[1]] = m[2].trim()
})

// auth-server env도 읽기 (AUTH_SUPABASE_URL/KEY)
const authEnvPath = path.join(__dirname, '../apps/auth-server/.env.local')
fs.readFileSync(authEnvPath, 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([A-Z_]+)=(.+)$/)
  if (m) process.env[m[1]] = m[2].trim()
})

const ELECTION_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const PHONE_RAW = '01077777777'
const PHONE_HASH = createHash('sha256').update(PHONE_RAW).digest('hex')

console.log(`전화번호 해시: ${PHONE_HASH}`)

// auth_db / ops_db 가 같은 Supabase 인스턴스인지 확인
const AUTH_URL = process.env.AUTH_SUPABASE_URL
const AUTH_KEY = process.env.AUTH_SUPABASE_SERVICE_KEY
const OPS_URL  = process.env.OPS_SUPABASE_URL
const OPS_KEY  = process.env.OPS_SUPABASE_SERVICE_KEY

const authSb = createClient(AUTH_URL, AUTH_KEY, { auth: { persistSession: false } })
const opsSb  = createClient(OPS_URL,  OPS_KEY,  { auth: { persistSession: false } })

async function main() {
  console.log('\n── 1. elections 확인/생성 (auth_db) ──────────────────')
  const { data: existing } = await authSb
    .from('elections')
    .select('id, title, status')
    .eq('id', ELECTION_ID)
    .maybeSingle()

  if (existing) {
    console.log(`  이미 존재: "${existing.title}" (status=${existing.status})`)
    if (existing.status !== 'open') {
      const { error } = await authSb
        .from('elections')
        .update({ status: 'open' })
        .eq('id', ELECTION_ID)
      if (error) { console.error('  status 업데이트 실패:', error.message); process.exit(1) }
      console.log('  → status를 "open"으로 변경')
    } else {
      console.log('  → status=open 확인')
    }
  } else {
    const { error } = await authSb.from('elections').insert({
      id: ELECTION_ID,
      title: '테스트 투표',
      description: '시뮬레이션 모드 테스트용 선거',
      status: 'open',
      opens_at: new Date(Date.now() - 3600_000).toISOString(),
      closes_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
    })
    if (error) { console.error('  elections 삽입 실패:', error.message); process.exit(1) }
    console.log('  → 새 선거 생성 완료')
  }

  console.log('\n── 2. voters 확인/등록 (auth_db) ─────────────────────')
  // 기존 다른 유권자 제거 후 010-7777-7777 한 명만 남기기
  const { data: allVoters } = await authSb
    .from('voters')
    .select('id, phone_number, is_voted')
    .eq('election_id', ELECTION_ID)

  console.log(`  현재 등록된 유권자 수: ${allVoters?.length ?? 0}`)

  const targetVoter = allVoters?.find(v => v.phone_number === PHONE_HASH)
  const othersToRemove = allVoters?.filter(v => v.phone_number !== PHONE_HASH) ?? []

  if (othersToRemove.length > 0) {
    const ids = othersToRemove.map(v => v.id)
    const { error } = await authSb.from('voters').delete().in('id', ids)
    if (error) {
      console.warn('  다른 유권자 삭제 실패 (명부 봉인 여부 확인):', error.message)
    } else {
      console.log(`  → ${ids.length}명의 다른 유권자 삭제`)
    }
  }

  if (targetVoter) {
    console.log(`  010-7777-7777 이미 등록됨 (is_voted=${targetVoter.is_voted})`)
    if (targetVoter.is_voted) {
      const { error } = await authSb
        .from('voters')
        .update({ is_voted: false, ri_issued_at: null })
        .eq('id', targetVoter.id)
      if (error) {
        console.warn('  is_voted 초기화 실패:', error.message)
      } else {
        console.log('  → is_voted를 false로 초기화')
      }
    }
  } else {
    const { error } = await authSb.from('voters').insert({
      phone_number: PHONE_HASH,
      election_id: ELECTION_ID,
      is_voted: false,
    })
    if (error) { console.error('  voters 삽입 실패:', error.message); process.exit(1) }
    console.log('  → 010-7777-7777 등록 완료')
  }

  console.log('\n── 3. ballot_options 확인/등록 (ops_db) ──────────────')
  const { data: existingOpts } = await opsSb
    .from('ballot_options')
    .select('id, option_text, display_order')
    .eq('election_id', ELECTION_ID)
    .order('display_order')

  if (existingOpts && existingOpts.length >= 2) {
    console.log('  이미 등록됨:')
    existingOpts.forEach(o => console.log(`    ${o.display_order}. ${o.option_text}`))
  } else {
    // 기존 항목 삭제 후 재생성
    if (existingOpts?.length) {
      await opsSb.from('ballot_options').delete().eq('election_id', ELECTION_ID)
    }
    const { error } = await opsSb.from('ballot_options').insert([
      { election_id: ELECTION_ID, option_text: '찬성', display_order: 1 },
      { election_id: ELECTION_ID, option_text: '반대', display_order: 2 },
    ])
    if (error) { console.error('  ballot_options 삽입 실패:', error.message); process.exit(1) }
    console.log('  → 찬성/반대 항목 등록 완료')
  }

  console.log('\n── 최종 상태 확인 ─────────────────────────────────────')
  const { data: election } = await authSb.from('elections').select('title, status, opens_at, closes_at').eq('id', ELECTION_ID).single()
  const { data: voters } = await authSb.from('voters').select('phone_number, is_voted').eq('election_id', ELECTION_ID)
  const { data: opts } = await opsSb.from('ballot_options').select('option_text, display_order').eq('election_id', ELECTION_ID).order('display_order')

  console.log(`  선거: ${election?.title} (status=${election?.status})`)
  console.log(`  유권자 수: ${voters?.length}명, is_voted=${voters?.[0]?.is_voted}`)
  console.log(`  항목: ${opts?.map(o => o.option_text).join(', ')}`)
  console.log(`  선거 ID: ${ELECTION_ID}`)
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
