import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ newRi: string }> },
) {
  // 라우트 파라미터명은 [newRi]이지만 실제 값은 공개용RI
  const { newRi: publicRi } = await params

  const { data: cert } = await supabase
    .from('vote_certificates')
    .select('election_id, selected_option_text, hmac_signature, created_at, is_published')
    .eq('new_ri', publicRi)
    .maybeSingle()

  if (!cert) {
    return NextResponse.json({ found: false })
  }

  if (!cert.is_published) {
    return NextResponse.json({ found: false, error: '아직 결과가 공개되지 않았습니다' })
  }

  return NextResponse.json({
    found: true,
    certificate: {
      electionId: cert.election_id,
      selectedOptionText: cert.selected_option_text,
      createdAt: cert.created_at,
      hmacSignature: cert.hmac_signature,
    },
  })
}
