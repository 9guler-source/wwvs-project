'use client'

import { useState } from 'react'
import Link from 'next/link'

interface VerifyResult {
  found: boolean
  error?: string
  certificate?: {
    electionId: string
    selectedOptionText: string
    createdAt: string
    hmacSignature: string
  }
}

export default function VerifyPage() {
  const [newRi, setNewRi] = useState('')
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleVerify = async () => {
    if (!newRi.trim()) return
    setIsLoading(true)
    setResult(null)

    try {
      const res = await fetch(`/api/verify/${encodeURIComponent(newRi.trim())}`)
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ found: false, error: '네트워크 오류가 발생했습니다' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="min-h-screen px-4 pt-10 pb-16">
      <div className="max-w-[500px] mx-auto">
        <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
          ← 목록으로
        </Link>

        <div className="mb-8">
          <h1 className="text-xl font-bold text-[#1B2A6B]">본인 투표 확인</h1>
          <p className="text-sm text-gray-500 mt-1">
            투표 완료 후 받은 확인 코드(신규 RI)로 본인 투표를 검증합니다
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            확인 코드 (UUID 형식)
          </label>
          <input
            type="text"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            value={newRi}
            onChange={e => setNewRi(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleVerify()}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#1B2A6B] transition-colors font-mono text-sm"
          />
          <button
            onClick={handleVerify}
            disabled={isLoading || !newRi.trim()}
            className="mt-3 w-full py-4 bg-[#1B2A6B] text-white font-semibold rounded-xl disabled:opacity-50 active:scale-95 transition-all"
          >
            {isLoading ? '확인 중...' : '확인하기'}
          </button>
        </div>

        {result && (
          <div
            className={`rounded-2xl border p-5 ${
              result.found
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}
          >
            {result.found && result.certificate ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-semibold text-green-800">확인서를 찾았습니다</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">선거 ID</span>
                    <span className="font-mono text-xs">{result.certificate.electionId.slice(0, 8)}…</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">선택 항목</span>
                    <span className="font-semibold text-gray-800">{result.certificate.selectedOptionText}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">투표 일시</span>
                    <span className="text-gray-700 text-xs">
                      {new Date(result.certificate.createdAt).toLocaleString('ko-KR')}
                    </span>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1">HMAC 서명</p>
                    <p className="font-mono text-xs text-gray-600 bg-white px-3 py-2 rounded-lg break-all border border-gray-200">
                      {result.certificate.hmacSignature}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-red-700">{result.error ?? '확인서를 찾을 수 없습니다'}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
