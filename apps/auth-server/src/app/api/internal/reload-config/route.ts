import { NextRequest, NextResponse } from 'next/server';
import { resetModeCache } from '@/lib/getMode';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('Authorization');
  const secret = process.env.SERVER_INTER_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  resetModeCache();
  return NextResponse.json({ success: true });
}
