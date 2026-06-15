'use client'

import { useEffect, useState } from 'react'
import type { BallotOption } from '@wwvs/shared'

type PageState = 'loading' | 'error' | 'ballot' | 'confirming' | 'submitting' | 'done'

interface Election {
  id: string
  title: string
  description: string
}

export default function VotePage() {
  const [state, setState] = useState<PageState>('loading')
  const [election, setElection] = useState<Election | null>(null)
  const [options, setOptions] = useState<BallotOption[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [error, setError] = useState('')
  const [ri, setRi] = useState('')
  const [electionId, setElectionId] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const riParam = params.get('ri') ?? localStorage.getItem('wwvs_ri') ?? ''
    const eidParam = params.get('electionId') ?? ''
    setRi(riParam)
    setElectionId(eidParam)

    if (!riParam || !eidParam) {
      setError('투표 코드 또는 선거 정보가 없습니다. 인증 서버에서 다시 시작해주세요.')
      setState('error')
      return
    }

    fetch(`/api/vote/ballot?ri=${encodeURIComponent(riParam)}&electionId=${encodeURIComponent(eidParam)}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setElection(data.election)
          setOptions(data.options)
          setState('ballot')
        } else {
          setError(data.error)
          setState('error')
        }
      })
      .catch(() => {
        setError('투표용지를 불러오는 데 실패했습니다')
        setState('error')
      })
  }, [])

  // Escape 키로 팝업 닫기
  useEffect(() => {
    if (state !== 'confirming') return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setState('ballot') }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state])

  // "투표하기" 클릭 → 팝업만 표시, 서버 요청 없음
  const handleVoteClick = () => {
    if (!selectedId) return
    setState('confirming')
  }

  // "다시 선택" → 팝업 닫기, 선택 항목 유지
  const handleCancel = () => {
    setState('ballot')
  }

  // "제출하기" → 실제 API 호출
  const handleConfirm = async () => {
    setState('submitting')
    setError('')

    try {
      const res = await fetch('/api/vote/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ri, electionId, selectedOptionId: selectedId }),
      })
      const data = await res.json()
      if (data.success) {
        localStorage.setItem(`wwvs_certificate_${electionId}`, JSON.stringify(data.certificate))
        window.location.href = `/complete?electionId=${electionId}`
      } else {
        setError(data.error)
        setState('ballot')
      }
    } catch {
      setError('투표 제출 중 오류가 발생했습니다')
      setState('ballot')
    }
  }

  const selectedOption = options.find(o => o.id === selectedId)

  if (state === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#1B2A6B] border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  if (state === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-[430px] bg-white rounded-2xl p-6 text-center shadow-sm border border-gray-100">
          <p className="text-red-600 font-semibold">{error}</p>
        </div>
      </main>
    )
  }

  return (
    <>
      <main className="flex min-h-screen items-start justify-center px-4 pt-10 pb-8">
        <div className="w-full max-w-[430px]">
          <div className="text-center mb-8">
            <p className="text-xs text-gray-400 mb-1">Who Whom Voting System</p>
            <h1 className="text-xl font-bold text-[#1B2A6B]">{election?.title}</h1>
            {election?.description && (
              <p className="text-sm text-gray-500 mt-2">{election.description}</p>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <p className="text-sm text-gray-600 mb-4 font-medium">아래 항목 중 하나를 선택하세요:</p>

            <div className="flex flex-col gap-3 mb-6">
              {options.map(opt => (
                <label
                  key={opt.id}
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                    selectedId === opt.id
                      ? 'border-[#1B2A6B] bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="vote"
                    value={opt.id}
                    checked={selectedId === opt.id}
                    onChange={() => setSelectedId(opt.id)}
                    className="accent-[#1B2A6B] w-4 h-4"
                  />
                  <span className="text-gray-800">{opt.text}</span>
                </label>
              ))}
            </div>

            {error && (
              <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              onClick={handleVoteClick}
              disabled={!selectedId || state === 'submitting'}
              className="w-full py-4 bg-[#1B2A6B] text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
            >
              {state === 'submitting' ? '처리 중...' : '투표하기'}
            </button>
          </div>

          <p className="text-center text-xs text-gray-400 mt-4">
            한 번 제출된 투표는 변경할 수 없습니다
          </p>
        </div>
      </main>

      {/* ── 투표 재확인 팝업 ───────────────────────────────────── */}
      {state === 'confirming' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        >
          {/* 배경 딤 — 클릭 시 닫기 */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={handleCancel}
            aria-hidden="true"
          />

          {/* 모달 카드 — 모바일: 바텀 시트 / 데스크톱: 중앙 다이얼로그 */}
          <div className="relative z-10 w-full sm:max-w-[400px] bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl mx-0 sm:mx-4 px-6 pt-5 pb-10 sm:pb-6">
            {/* 모바일 드래그 핸들 */}
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6 sm:hidden" />

            {/* 아이콘 */}
            <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-7 h-7 text-[#1B2A6B]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
            </div>

            {/* 안내 문구 */}
            <div className="text-center mb-7">
              <h2 id="confirm-title" className="text-lg font-bold text-gray-900 mb-3">
                투표를 제출하시겠습니까?
              </h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                선택한 항목
              </p>
              <div className="inline-flex items-center gap-2 mt-2 mb-2 px-5 py-2 bg-blue-50 border border-[#1B2A6B]/20 rounded-xl">
                <span className="text-[#1B2A6B] font-bold text-lg">
                  {selectedOption?.text}
                </span>
              </div>
              <p className="text-sm text-gray-500">으로 투표를 제출합니다.</p>
              <p className="text-xs text-red-500 mt-3 font-medium">
                제출 후에는 변경할 수 없습니다.
              </p>
            </div>

            {/* 버튼 */}
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                className="flex-1 py-3.5 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 active:scale-95 transition-all text-sm"
              >
                다시 선택
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-3.5 bg-[#1B2A6B] text-white font-semibold rounded-xl active:scale-95 transition-all text-sm shadow-md"
              >
                제출하기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
