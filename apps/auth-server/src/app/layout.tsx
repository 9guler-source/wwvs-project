import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Who Whom Voting System',
  description: '모바일 전화번호 기반 익명 전자투표 시스템',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full bg-gray-50 antialiased">{children}</body>
    </html>
  )
}
