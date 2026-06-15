import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/results/{electionId}/certificates
// 공개된 투표확인서 전체를 앞마크 알파벳 순으로 반환
// new_ri = 공개용RI = {앞마크}_{신규RI}_{1차마크}_{2차마크} → ORDER BY new_ri = 앞마크 순
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ electionId: string }> },
) {
  const { electionId } = await params
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get('limit') ?? '500')))
  const offset = (page - 1) * limit

  const { data, error, count } = await supabase
    .from('vote_certificates')
    .select('new_ri, selected_option_text, created_at', { count: 'exact' })
    .eq('election_id', electionId)
    .eq('is_published', true)
    .order('new_ri')   // 앞마크 알파벳 순 (동일 앞마크 내에서는 신규RI 기준 보조 정렬)
    .range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }

  if (!data?.length) {
    return NextResponse.json({ error: '아직 공개된 확인서가 없습니다' }, { status: 404 })
  }

  // new_ri(공개용RI)를 파싱해서 앞마크만 추출하여 함께 반환
  const certificates = data.map(row => {
    const parts = (row.new_ri as string).split('_')
    return {
      publicRi: row.new_ri,
      markWord: parts[0] ?? '',
      selectedOptionText: row.selected_option_text,
      createdAt: row.created_at,
    }
  })

  return NextResponse.json({ certificates, total: count ?? 0, page, limit })
}
