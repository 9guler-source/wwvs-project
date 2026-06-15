import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checkAdminAuth } from '@/lib/admin-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ electionId: string }> },
) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { electionId } = await params

  const [votersRes, sealRes] = await Promise.all([
    supabase
      .from('voters')
      .select('id', { count: 'exact', head: true })
      .eq('election_id', electionId),
    supabase
      .from('roster_seal')
      .select('is_sealed, sealed_at, voters_hash, voter_count')
      .eq('election_id', electionId)
      .maybeSingle(),
  ])

  return NextResponse.json({
    ok: true,
    voterCount: votersRes.count ?? 0,
    isSealed: sealRes.data?.is_sealed ?? false,
    sealedAt: sealRes.data?.sealed_at ?? null,
    votersHash: sealRes.data?.voters_hash ?? null,
    sealedCount: sealRes.data?.voter_count ?? null,
  })
}
