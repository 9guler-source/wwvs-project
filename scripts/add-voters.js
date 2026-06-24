'use strict'
const { createHash } = require('crypto')
const path = require('path')
const { createClient } = require(path.join(__dirname, '../node_modules/@supabase/supabase-js'))
const fs = require('fs')

const envPath = path.join(__dirname, '../apps/auth-server/.env.local')
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([A-Z_]+)=(.+)$/)
  if (m) process.env[m[1]] = m[2].trim()
})

const sb = createClient(
  process.env.AUTH_SUPABASE_URL,
  process.env.AUTH_SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
)

const ELECTION_ID = 'aaaaaaaa-0000-0000-0000-000000000001'

async function main() {
  // 010-1111-1111 ~ 010-1111-1199 (89개)
  const phones = []
  for (let i = 1111; i <= 1199; i++) {
    phones.push(`0101111${i}`)
  }
  const hashes = phones.map(p => createHash('sha256').update(p).digest('hex'))

  // 1. 이미 등록된 해시 조회
  const { data: existing, error: fetchErr } = await sb
    .from('voters')
    .select('phone_number')
    .eq('election_id', ELECTION_ID)
    .in('phone_number', hashes)

  if (fetchErr) { console.error('조회 실패:', fetchErr.message); process.exit(1) }

  const existingSet = new Set((existing ?? []).map(r => r.phone_number))
  const newRows = hashes
    .filter(h => !existingSet.has(h))
    .map(h => ({ phone_number: h, election_id: ELECTION_ID, is_voted: false }))

  console.log(`전체: ${hashes.length}개 | 이미 존재: ${existingSet.size}개 | 신규 삽입 대상: ${newRows.length}개`)

  if (newRows.length === 0) {
    console.log('추가할 번호가 없습니다 (모두 중복).')
    return
  }

  // 2. 신규 rows만 INSERT
  const { error: insertErr } = await sb.from('voters').insert(newRows)
  if (insertErr) { console.error('INSERT 실패:', insertErr.message); process.exit(1) }

  console.log(`✅ 완료: ${newRows.length}개 추가됨`)
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
