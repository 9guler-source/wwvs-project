import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ electionId: string }> },
) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { electionId } = await params
  const now = new Date().toISOString()

  // 투표확인서 집계
  const { data: certs, error: certsError } = await supabase
    .from('vote_certificates')
    .select('selected_option_id, selected_option_text')
    .eq('election_id', electionId)

  if (certsError) {
    return NextResponse.json({ success: false, error: '확인서 조회 실패' }, { status: 500 })
  }

  // 항목별 집계
  const tally = new Map<string, { text: string; count: number }>()
  for (const cert of certs ?? []) {
    const existing = tally.get(cert.selected_option_id)
    if (existing) {
      existing.count += 1
    } else {
      tally.set(cert.selected_option_id, { text: cert.selected_option_text, count: 1 })
    }
  }

  // election_results upsert
  const resultsToInsert = Array.from(tally.entries()).map(([optionId, { text, count }]) => ({
    election_id: electionId,
    option_id: optionId,
    option_text: text,
    vote_count: count,
    finalized_at: now,
  }))

  if (resultsToInsert.length > 0) {
    const { error: deleteError } = await supabase
      .from('election_results')
      .delete()
      .eq('election_id', electionId)

    if (deleteError) {
      return NextResponse.json({ success: false, error: '결과 초기화 실패' }, { status: 500 })
    }

    const { error: resultsError } = await supabase
      .from('election_results')
      .insert(resultsToInsert)

    if (resultsError) {
      return NextResponse.json({ success: false, error: '결과 저장 실패' }, { status: 500 })
    }
  }

  // 확인서 공개 처리
  await supabase
    .from('vote_certificates')
    .update({ is_published: true })
    .eq('election_id', electionId)

  return NextResponse.json({ success: true, totalVotes: certs?.length ?? 0 })
}
