import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ electionId: string }> },
) {
  const { electionId } = await params

  // election_results 테이블에서 집계 결과 조회
  const { data: results, error } = await supabase
    .from('election_results')
    .select('option_id, option_text, vote_count, finalized_at')
    .eq('election_id', electionId)
    .order('vote_count', { ascending: false })

  if (error) {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }

  if (!results?.length) {
    return NextResponse.json({ error: '아직 개표 결과가 없습니다' }, { status: 404 })
  }

  const totalVotes = results.reduce((sum, r) => sum + r.vote_count, 0)
  const finalizedAt = results[0]?.finalized_at ?? null

  return NextResponse.json({
    election: { id: electionId, status: finalizedAt ? 'closed' : 'open' },
    results: results.map(r => ({
      optionId: r.option_id,
      optionText: r.option_text,
      voteCount: r.vote_count,
      percentage: totalVotes > 0 ? Math.round((r.vote_count / totalVotes) * 1000) / 10 : 0,
    })),
    totalVotes,
    finalizedAt,
  })
}
