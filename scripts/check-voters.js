'use strict'
const { createHash } = require('crypto')
const path = require('path')
const { createClient } = require(path.join(__dirname, '../node_modules/@supabase/supabase-js'))
const fs = require('fs')

fs.readFileSync(path.join(__dirname, '../apps/auth-server/.env.local'), 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([A-Z_]+)=(.+)$/)
  if (m) process.env[m[1]] = m[2].trim()
})

const sb = createClient(process.env.AUTH_SUPABASE_URL, process.env.AUTH_SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const ELECTION_ID = 'aaaaaaaa-0000-0000-0000-000000000001'

async function main() {
  const { count } = await sb.from('voters').select('*', { count: 'exact', head: true }).eq('election_id', ELECTION_ID)
  console.log('voters 총 수:', count)

  const h1 = createHash('sha256').update('01011111111').digest('hex')
  const { data } = await sb.from('voters').select('id, is_voted').eq('phone_number', h1).maybeSingle()
  console.log('010-1111-1111 존재 여부:', data ? `존재 (is_voted=${data.is_voted})` : '없음')
}

main().catch(e => console.error(e.message))
