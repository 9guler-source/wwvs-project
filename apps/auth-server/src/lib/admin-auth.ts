import { NextRequest } from 'next/server'

export function checkAdminAuth(request: NextRequest): boolean {
  const header = request.headers.get('authorization')
  const secret = process.env.ADMIN_SECRET
  return !!secret && header === `Bearer ${secret}`
}
