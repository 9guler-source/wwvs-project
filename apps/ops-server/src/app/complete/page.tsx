'use client'

import { useEffect, useState } from 'react'
import type { VoteCertificate } from '@wwvs/shared'

export default function CompletePage() {
  const [certificate, setCertificate] = useState<VoteCertificate | null>(null)
  const [copied, setCopied] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const electionId = params.get('electionId') ?? ''
    const stored = localStorage.getItem(`wwvs_certificate_${electionId}`)
    if (stored) {
      try {
        setCertificate(JSON.parse(stored))
      } catch {
        // ignore
      }
    }
  }, [])

  const handleCopyCode = () => {
    if (!certificate) return
    navigator.clipboard.writeText(certificate.publicRi).then(() => {
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    })
  }

  const handleCopy = () => {
    if (!certificate) return
    const text = [
      '== WWVS 투표확인서 ==',
      `선거 ID: ${certificate.electionId}`,
      `선택 항목: ${certificate.selectedOptionText}`,
      `확인 코드: ${certificate.publicRi}`,
      `투표 일시: ${new Date(certificate.createdAt).toLocaleString('ko-KR')}`,
      `HMAC 서명: ${certificate.hmacSignature}`,
    ].join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (!certificate) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-[430px] bg-white rounded-2xl p-6 text-center shadow-sm border border-gray-100">
          <p className="text-gray-500">투표 확인서를 찾을 수 없습니다.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-start justify-center px-4 pt-10 pb-8">
      <div className="w-full max-w-[430px]">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-800">투표가 완료되었습니다</h1>
          <p className="text-sm text-gray-500 mt-1">귀하의 소중한 한 표가 접수되었습니다</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            투표확인서
          </h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">선거 ID</span>
              <span className="text-gray-800 font-mono text-xs">{certificate.electionId.slice(0, 8)}…</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">선택 항목</span>
              <span className="text-gray-800 font-semibold">{certificate.selectedOptionText}</span>
            </div>
            <hr className="border-gray-100" />
            <div>
              <p className="text-gray-500 mb-1">확인 코드 (공개용RI)</p>
              <div className="flex items-center gap-2">
                <p className="font-mono text-xs text-[#1B2A6B] bg-blue-50 px-3 py-2 rounded-lg break-all flex-1">
                  {certificate.publicRi}
                </p>
                <button
                  onClick={handleCopyCode}
                  className="shrink-0 text-xs px-3 py-2 bg-blue-100 text-[#1B2A6B] rounded-lg font-medium active:scale-95 transition-all whitespace-nowrap"
                >
                  {copiedCode ? '복사되었습니다' : '복사'}
                </button>
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">투표 일시</span>
              <span className="text-gray-800 text-xs">
                {new Date(certificate.createdAt).toLocaleString('ko-KR')}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-sm text-amber-800">
          이 확인서를 저장해두세요. 투표 종료 후 확인 코드로 본인 투표를 검증할 수 있습니다.
        </div>

        <button
          onClick={handleCopy}
          className="w-full py-4 bg-[#1B2A6B] text-white font-semibold rounded-xl active:scale-95 transition-all"
        >
          {copied ? '복사됨!' : '확인서 텍스트 복사'}
        </button>
      </div>
    </main>
  )
}
