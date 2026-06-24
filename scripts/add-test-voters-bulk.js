'use strict'
const { createHash } = require('crypto')
const path = require('path')
const { createClient } = require(path.join(__dirname, '../node_modules/@supabase/supabase-js'))
const fs = require('fs')

fs.readFileSync(path.join(__dirname, '../apps/auth-server/.env.local'), 'utf8')
  .split('\n').forEach(line => {
    const m = line.match(/^([A-Z_]+)=(.+)$/)
    if (m) process.env[m[1]] = m[2].trim()
  })

const sb = createClient(
  process.env.AUTH_SUPABASE_URL,
  process.env.AUTH_SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
)

const ELECTION_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const CHECK_BATCH = 100   // IN 절 URL 길이 제한 방지
const INSERT_BATCH = 500

function sha256(s) { return createHash('sha256').update(s).digest('hex') }

async function main() {
  // 1. 8,000개 번호 생성
  const prefixes = ['2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999']
  const allRows = []
  for (const prefix of prefixes) {
    for (let i = 0; i <= 999; i++) {
      const phone = `010${prefix}${String(i).padStart(4, '0')}`
      allRows.push({ phone_number: sha256(phone), election_id: ELECTION_ID, is_voted: false })
    }
  }
  console.log(`생성된 번호: ${allRows.length}개`)

  // 2. 중복 확인 (100개씩 IN 쿼리)
  const allHashes = allRows.map(r => r.phone_number)
  const existingSet = new Set()
  const totalCheckBatches = Math.ceil(allHashes.length / CHECK_BATCH)

  for (let i = 0; i < allHashes.length; i += CHECK_BATCH) {
    const batch = allHashes.slice(i, i + CHECK_BATCH)
    const { data, error } = await sb
      .from('voters')
      .select('phone_number')
      .eq('election_id', ELECTION_ID)
      .in('phone_number', batch)

    if (error) { console.error('조회 실패:', error.message); process.exit(1) }
    for (const row of (data ?? [])) existingSet.add(row.phone_number)

    const done = Math.ceil((i + CHECK_BATCH) / allHashes.length * totalCheckBatches)
    process.stdout.write(`\r중복 확인: ${Math.min(i + CHECK_BATCH, allHashes.length)}/${allHashes.length}`)
  }
  console.log(`\n이미 존재: ${existingSet.size}개`)

  // 3. 신규 행만 추출
  const newRows = allRows.filter(r => !existingSet.has(r.phone_number))
  console.log(`신규 삽입 대상: ${newRows.length}개`)

  if (newRows.length === 0) {
    console.log('추가할 번호가 없습니다 (모두 중복).')
  } else {
    // 4. 500개씩 INSERT
    let inserted = 0
    for (let i = 0; i < newRows.length; i += INSERT_BATCH) {
      const batch = newRows.slice(i, i + INSERT_BATCH)
      const { error } = await sb.from('voters').insert(batch)
      if (error) { console.error(`\nINSERT 실패 (${i}~${i + batch.length}):`, error.message); process.exit(1) }
      inserted += batch.length
      process.stdout.write(`\r삽입 중: ${inserted}/${newRows.length}`)
    }
    console.log(`\n✅ ${inserted}개 추가 완료`)
  }

  // 5. 최종 집계
  const { count } = await sb
    .from('voters')
    .select('*', { count: 'exact', head: true })
    .eq('election_id', ELECTION_ID)
  console.log(`📊 voters 테이블 총 인원: ${count}명`)
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
