import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseAdmin';
import { parseVoters } from '@/lib/parseVoters';

type Params = { params: Promise<{ electionId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { electionId } = await params;
  const supabase = createClient();

  let buffer: Buffer;
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    const arrayBuffer = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } catch {
    return NextResponse.json({ error: '파일을 읽을 수 없습니다.' }, { status: 400 });
  }

  const { valid, errors } = parseVoters(buffer);

  let successCount = 0;
  if (valid.length > 0) {
    const rows = valid.map((v) => ({
      election_id: electionId,
      name: v.name,
      phone_hash: v.phoneHash,
      is_voted: false,
    }));

    const { error: insertErr, count } = await supabase
      .from('voters')
      .upsert(rows, { onConflict: 'election_id,phone_hash', ignoreDuplicates: true })
      .select();

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    successCount = count ?? valid.length;
  }

  await supabase.from('admin_logs').insert({
    action: 'voter_upload',
    detail: {
      election_id: electionId,
      total: valid.length + errors.length,
      success: successCount,
      errors: errors.length,
    },
  });

  return NextResponse.json({ total: valid.length + errors.length, success: successCount, errors });
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { electionId } = await params;
  const supabase = createClient();

  const { data, error } = await supabase
    .from('voters')
    .select('id, name, created_at')
    .eq('election_id', electionId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ count: data.length, voters: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { electionId } = await params;
  const supabase = createClient();

  const { data: election, error: elErr } = await supabase
    .from('elections')
    .select('status')
    .eq('id', electionId)
    .single();

  if (elErr || !election) return NextResponse.json({ error: '선거를 찾을 수 없습니다.' }, { status: 404 });
  if (election.status !== 'pending') {
    return NextResponse.json({ error: '대기 중인 선거만 명부를 삭제할 수 있습니다.' }, { status: 403 });
  }

  const { error: delErr, count } = await supabase
    .from('voters')
    .delete({ count: 'exact' })
    .eq('election_id', electionId);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ deleted: count ?? 0 });
}
