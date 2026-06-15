import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checkAdminAuth } from '@/lib/admin-auth'
import { hashPhone } from '@/lib/phone-hash'

export async function POST(request: NextRequest) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { electionId, phones } = await request.json() as {
    electionId: string
    phones: string[]
  }

  if (!electionId || !Array.isArray(phones) || phones.length === 0) {
    return NextResponse.json({ ok: false, error: '필수 파라미터 누락' }, { status: 400 })
  }

  // Check seal
  const { data: sealData } = await supabase
    .from('roster_seal')
    .select('is_sealed')
    .eq('election_id', electionId)
    .maybeSingle()

  if (sealData?.is_sealed) {
    return NextResponse.json({ ok: false, error: '이미 봉인된 선거인명부입니다' }, { status: 400 })
  }

  // Insert voters in batches of 500
  const rows = phones.map(phone => ({
    phone_number: hashPhone(phone),
    election_id: electionId,
  }))

  let inserted = 0
  const batchSize = 500

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase
      .from('voters')
      .insert(batch)

    if (error) {
      console.error('[confirm-roster] insert error:', error.message)
      return NextResponse.json(
        { ok: false, error: `삽입 실패 (배치 ${Math.floor(i / batchSize) + 1}): ${error.message}` },
        { status: 500 },
      )
    }
    inserted += batch.length
  }

  console.log(`[admin] 선거인명부 확정: election=${electionId} count=${inserted}`)
  return NextResponse.json({ ok: true, inserted })
}
