import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'WWVS 투표소',
  description: '투표용지 및 투표 제출',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full bg-gray-50 antialiased">{children}</body>
    </html>
  )
}
