import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { secret } = await request.json()
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  return NextResponse.json({ ok: true })
}
