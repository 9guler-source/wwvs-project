import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { decryptSalt } from '@/lib/daily-function'

// POST /api/admin/publish-functions/{electionId}
// 이의신청 기간 만료 후 관리자가 수동으로 호출 — F1/F2 salt를 복호화하여 공개
// Authorization: Bearer {OPS_HMAC_SECRET}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ electionId: string }> },
) {
  const { electionId } = await params

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.OPS_HMAC_SECRET}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { data: df, error } = await supabase
    .from('daily_functions')
    .select('id, f1_encrypted, f2_encrypted, is_published')
    .eq('election_id', electionId)
    .maybeSingle()

  if (error || !df) {
    return NextResponse.json({ success: false, error: 'daily_functions 없음' }, { status: 404 })
  }

  let f1Salt: string, f2Salt: string
  try {
    f1Salt = decryptSalt(df.f1_encrypted)
    f2Salt = decryptSalt(df.f2_encrypted)
  } catch (e) {
    console.error('[publish-functions] 복호화 실패', e)
    return NextResponse.json({ success: false, error: '복호화 실패' }, { status: 500 })
  }

  if (!df.is_published) {
    await supabase
      .from('daily_functions')
      .update({ is_published: true, published_at: new Date().toISOString() })
      .eq('id', df.id)
  }

  console.log(`[publish-functions] 선거 ${electionId} F1/F2 공개 완료`)
  return NextResponse.json({ success: true, electionId, f1Salt, f2Salt, alreadyPublished: df.is_published })
}
