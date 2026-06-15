import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const ri = searchParams.get('ri')
  const electionId = searchParams.get('electionId')

  if (!ri || !electionId) {
    return NextResponse.json({ success: false, error: '필수 파라미터 누락' }, { status: 400 })
  }

  // RI 유효성 확인
  const { data: riRecord } = await supabase
    .from('ri_ledger')
    .select('id, is_used, expires_at')
    .eq('ri_value', ri)
    .eq('election_id', electionId)
    .maybeSingle()

  if (!riRecord) {
    return NextResponse.json({ success: false, error: '유효하지 않은 접근입니다' }, { status: 403 })
  }

  if (riRecord.is_used) {
    return NextResponse.json({ success: false, error: '이미 사용된 투표 코드입니다' }, { status: 403 })
  }

  if (new Date(riRecord.expires_at) < new Date()) {
    return NextResponse.json({ success: false, error: '투표 시간이 만료되었습니다' }, { status: 403 })
  }

  // 투표 항목 조회
  const { data: options, error: optionsError } = await supabase
    .from('ballot_options')
    .select('id, option_text, display_order')
    .eq('election_id', electionId)
    .order('display_order')

  if (optionsError || !options?.length) {
    return NextResponse.json({ success: false, error: '투표 항목을 찾을 수 없습니다' }, { status: 404 })
  }

  // election 정보는 ballot_options에서 election_id만 확인 가능하므로 기본 정보 반환
  return NextResponse.json({
    success: true,
    election: {
      id: electionId,
      title: process.env.NEXT_PUBLIC_SITE_NAME ?? 'WWVS 선거',
      description: '',
    },
    options: options.map(o => ({
      id: o.id,
      text: o.option_text,
      displayOrder: o.display_order,
    })),
  })
}
