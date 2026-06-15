'use strict'
// 선거 초기 설정 스크립트
// 용도: mark_pool (10,000개 앞마크) + daily_functions (F1/F2 암호화 저장)
// 실행: node scripts/setup-election.js <electionId>
// 예:   node scripts/setup-election.js aaaaaaaa-0000-0000-0000-000000000001

const { createCipheriv, createDecipheriv, createHmac, randomBytes } = require('crypto')
const path = require('path')
const { createClient } = require(path.join(__dirname, '../node_modules/@supabase/supabase-js'))

// ── 환경 변수 로딩 (ops-server .env.local) ──────────────────────────────
const fs = require('fs')
const envPath = path.join(__dirname, '../apps/ops-server/.env.local')
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([A-Z_]+)=(.+)$/)
  if (m) process.env[m[1]] = m[2].trim()
})

const SUPABASE_URL = process.env.OPS_SUPABASE_URL
const SUPABASE_KEY = process.env.OPS_SUPABASE_SERVICE_KEY
const ENC_KEY_HEX = process.env.DAILY_FUNCTION_ENCRYPTION_KEY

if (!SUPABASE_URL || !SUPABASE_KEY || !ENC_KEY_HEX) {
  console.error('FATAL: OPS_SUPABASE_URL / OPS_SUPABASE_SERVICE_KEY / DAILY_FUNCTION_ENCRYPTION_KEY 미설정')
  process.exit(1)
}

const electionId = process.argv[2]
if (!electionId) {
  console.error('Usage: node scripts/setup-election.js <electionId>')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
const ENC_KEY = Buffer.from(ENC_KEY_HEX, 'hex')

// ── 암호화 유틸 ─────────────────────────────────────────────────────────
function encryptSalt(plain) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', ENC_KEY, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${enc.toString('hex')}:${tag.toString('hex')}`
}

function decryptSalt(stored) {
  const [ivHex, encHex, tagHex] = stored.split(':')
  const decipher = createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return decipher.update(Buffer.from(encHex, 'hex'), undefined, 'utf8') + decipher.final('utf8')
}

// ── 단어 목록 ────────────────────────────────────────────────────────────
const ADJECTIVES = [
  'Amber','Azure','Bold','Brave','Bright','Calm','Clear','Cold','Cool','Crisp',
  'Dark','Deep','Dim','Dry','Dull','Eager','Early','Easy','Epic','Fair',
  'Fast','Fine','Firm','Flat','Free','Gentle','Grand','Grave','Great','Green',
  'Hazy','High','Huge','Icy','Idle','Jade','Just','Keen','Kind','Large',
  'Late','Lazy','Lean','Lofty','Lush','Merry','Mild','Misty','Neat','Nimble',
  'Noble','Odd','Open','Pale','Plain','Plush','Pure','Quiet','Rapid','Rare',
  'Rich','Rough','Round','Royal','Ruddy','Sandy','Sharp','Shy','Silk','Slim',
  'Slow','Smart','Smooth','Snowy','Soft','Stark','Still','Stone','Stormy','Stout',
  'Sturdy','Swift','Tall','Tame','Thin','Tiny','Tidy','Tough','True','Urban',
  'Vast','Vivid','Warm','Wavy','Wild','Windy','Wise','Witty','Woody','Young',
]

const NOUNS = [
  'Arch','Bay','Bell','Berg','Birch','Bond','Book','Brew','Brook','Bush',
  'Cairn','Cape','Cave','Chill','Cliff','Cloud','Coil','Cove','Creek','Crest',
  'Dale','Dawn','Deck','Dell','Dew','Dome','Drift','Drop','Dune','Edge',
  'Falls','Fern','Field','Flare','Flame','Flint','Flow','Fog','Ford','Fort',
  'Frost','Gate','Glade','Glen','Gorge','Grain','Grove','Gulf','Haze','Heath',
  'Hill','Hollow','Holt','Horn','Isle','Knoll','Lake','Lane','Lark','Leaf',
  'Ledge','Mead','Mesa','Mill','Mire','Mist','Moon','Moor','Mount','Oak',
  'Path','Peak','Pine','Plain','Point','Pool','Port','Reef','Ridge','Rill',
  'Rise','River','Rock','Run','Sand','Sea','Shore','Slope','Spring','Storm',
  'Sun','Tide','Trail','Tree','Vale','Vine','Wave','Well','Wind','Wood',
]

async function main() {
  console.log(`선거 초기 설정 시작: ${electionId}`)

  // ── 1. mark_pool 중복 확인 ───────────────────────────────────────────
  const { count: existing } = await sb
    .from('mark_pool')
    .select('id', { count: 'exact', head: true })
    .eq('election_id', electionId)
  if (existing > 0) {
    console.log(`mark_pool 이미 존재 (${existing}개) — 삽입 건너뜀`)
  } else {
    console.log('mark_pool 생성 중...')
    // 100 adjective × 100 noun = 10,000개를 100행씩 배치 삽입
    let inserted = 0
    for (const adj of ADJECTIVES) {
      const batch = NOUNS.map(noun => ({
        election_id: electionId,
        mark_word: adj + noun,
      }))
      const { error } = await sb.from('mark_pool').insert(batch)
      if (error) { console.error(`배치 삽입 실패 (${adj}):`, error.message); process.exit(1) }
      inserted += batch.length
      process.stdout.write(`\r  진행: ${inserted}/10000`)
    }
    console.log(`\n  mark_pool 삽입 완료: ${inserted}개`)
  }

  // ── 2. daily_functions 설정 ──────────────────────────────────────────
  const { data: existingDf } = await sb
    .from('daily_functions')
    .select('id, is_published')
    .eq('election_id', electionId)
    .maybeSingle()

  if (existingDf) {
    console.log(`daily_functions 이미 존재 (is_published=${existingDf.is_published}) — 건너뜀`)
  } else {
    const f1Salt = randomBytes(32).toString('hex')
    const f2Salt = randomBytes(32).toString('hex')
    const f1Encrypted = encryptSalt(f1Salt)
    const f2Encrypted = encryptSalt(f2Salt)

    // 복호화 검증
    if (decryptSalt(f1Encrypted) !== f1Salt || decryptSalt(f2Encrypted) !== f2Salt) {
      console.error('암호화 자가검증 실패')
      process.exit(1)
    }

    const { error } = await sb.from('daily_functions').insert({
      election_id: electionId,
      f1_encrypted: f1Encrypted,
      f2_encrypted: f2Encrypted,
    })
    if (error) { console.error('daily_functions 삽입 실패:', error.message); process.exit(1) }
    console.log('daily_functions 생성 완료 (F1/F2 암호화 저장)')
    console.log('  암호화 검증: OK')
  }

  // ── 최종 확인 ───────────────────────────────────────────────────────
  const { count: markCount } = await sb
    .from('mark_pool')
    .select('id', { count: 'exact', head: true })
    .eq('election_id', electionId)
  const { data: df } = await sb
    .from('daily_functions')
    .select('id, is_published, created_at')
    .eq('election_id', electionId)
    .maybeSingle()

  console.log(`\n초기 설정 완료:`)
  console.log(`  mark_pool: ${markCount}개`)
  console.log(`  daily_functions: ${df ? `존재 (is_published=${df.is_published})` : '없음 ❌'}`)
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
