import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ status: 'ok', server: 'ops-server', timestamp: new Date().toISOString() })
}
