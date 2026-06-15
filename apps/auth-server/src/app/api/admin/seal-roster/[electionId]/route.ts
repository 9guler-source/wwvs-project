import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { supabase } from '@/lib/supabase'
import { checkAdminAuth } from '@/lib/admin-auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ electionId: string }> },
) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { electionId } = await params

  // Check already sealed
  const { data: existing } = await supabase
    .from('roster_seal')
    .select('is_sealed, voters_hash, voter_count')
    .eq('election_id', electionId)
    .maybeSingle()

  if (existing?.is_sealed) {
    return NextResponse.json({
      ok: true,
      alreadySealed: true,
      votersHash: existing.voters_hash,
      voterCount: existing.voter_count,
    })
  }

  // Fetch all voters sorted by phone_number (deterministic order)
  const { data: voters, error } = await supabase
    .from('voters')
    .select('phone_number')
    .eq('election_id', electionId)
    .order('phone_number')

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  if (!voters || voters.length === 0) {
    return NextResponse.json({ ok: false, error: '등록된 선거인이 없습니다' }, { status: 400 })
  }

  // Compute SHA-256 hash of all phone hashes (sorted, newline-separated)
  const combined = voters.map(v => v.phone_number).join('\n')
  const votersHash = createHash('sha256').update(combined).digest('hex')
  const voterCount = voters.length
  const now = new Date().toISOString()

  const upsertData = {
    election_id: electionId,
    is_sealed: true,
    sealed_at: now,
    voters_hash: votersHash,
    voter_count: voterCount,
  }

  const { error: upsertError } = await supabase
    .from('roster_seal')
    .upsert(upsertData, { onConflict: 'election_id' })

  if (upsertError) {
    return NextResponse.json({ ok: false, error: upsertError.message }, { status: 500 })
  }

  console.log(`[admin] 선거인명부 봉인: election=${electionId} count=${voterCount} hash=${votersHash.slice(0, 16)}...`)
  return NextResponse.json({ ok: true, votersHash, voterCount, sealedAt: now })
}
