import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ electionId: string }> },
) {
  const { electionId } = await params
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '100')))
  const offset = (page - 1) * limit

  // is_published=true인 확인서만 공개
  const { data: certificates, error, count } = await supabase
    .from('vote_certificates')
    .select('new_ri, election_id, selected_option_text, hmac_signature, created_at', { count: 'exact' })
    .eq('election_id', electionId)
    .eq('is_published', true)
    .order('new_ri')   // 공개용RI = {앞마크}_{uuid}_{...} → 앞마크 알파벳 순 정렬
    .range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }

  if (!certificates?.length) {
    return NextResponse.json({ error: '아직 공개된 확인서가 없습니다' }, { status: 404 })
  }

  return NextResponse.json({ certificates, total: count ?? 0, page })
}
