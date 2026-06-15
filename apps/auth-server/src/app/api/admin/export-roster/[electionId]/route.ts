import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checkAdminAuth } from '@/lib/admin-auth'
import * as XLSX from 'xlsx'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ electionId: string }> },
) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { electionId } = await params

  const [votersRes, electionRes, sealRes] = await Promise.all([
    supabase
      .from('voters')
      .select('phone_number, is_voted, ri_issued_at, created_at')
      .eq('election_id', electionId)
      .order('created_at'),
    supabase
      .from('elections')
      .select('title')
      .eq('id', electionId)
      .maybeSingle(),
    supabase
      .from('roster_seal')
      .select('is_sealed, sealed_at, voters_hash, voter_count')
      .eq('election_id', electionId)
      .maybeSingle(),
  ])

  if (votersRes.error) {
    return NextResponse.json({ ok: false, error: votersRes.error.message }, { status: 500 })
  }

  const voters = votersRes.data ?? []
  const title = electionRes.data?.title ?? electionId
  const seal = sealRes.data

  // Build Excel workbook
  const wb = XLSX.utils.book_new()

  // Sheet 1: Voter list
  const voterRows = voters.map((v, idx) => ({
    '번호': idx + 1,
    '전화번호_해시(SHA-256)': v.phone_number,
    '등록일시': v.created_at ? new Date(v.created_at).toLocaleString('ko-KR') : '',
    'RI발급일시': v.ri_issued_at ? new Date(v.ri_issued_at).toLocaleString('ko-KR') : '',
    '투표완료': v.is_voted ? 'Y' : 'N',
  }))

  const ws1 = XLSX.utils.json_to_sheet(voterRows)
  XLSX.utils.book_append_sheet(wb, ws1, '선거인명부')

  // Sheet 2: Metadata
  const meta = [
    { '항목': '선거명', '값': title },
    { '항목': '선거 ID', '값': electionId },
    { '항목': '총 선거인 수', '값': voters.length },
    { '항목': '투표 완료 수', '값': voters.filter(v => v.is_voted).length },
    { '항목': '봉인 여부', '값': seal?.is_sealed ? '봉인됨' : '봉인 전' },
    { '항목': '봉인 일시', '값': seal?.sealed_at ? new Date(seal.sealed_at).toLocaleString('ko-KR') : '-' },
    { '항목': '명부 해시(SHA-256)', '값': seal?.voters_hash ?? '-' },
    { '항목': '내보내기 일시', '값': new Date().toLocaleString('ko-KR') },
  ]
  const ws2 = XLSX.utils.json_to_sheet(meta)
  XLSX.utils.book_append_sheet(wb, ws2, '메타데이터')

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const filename = `voters_${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
