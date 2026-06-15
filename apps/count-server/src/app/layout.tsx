import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'WWVS 개표·검증 포털',
  description: 'Who Whom Voting System 공개 검증 포털',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full bg-gray-50 antialiased">{children}</body>
    </html>
  )
}
