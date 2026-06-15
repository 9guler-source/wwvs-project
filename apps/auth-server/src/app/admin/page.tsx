'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface Election {
  id: string
  title: string
  status: string
  opens_at: string
  closes_at: string
}

interface ValidationResult {
  total: number
  valid: number
  formatErrors: number
  withinFileDups: number
  existingDups: number
  validPhones: string[]
  errorRows: { row: number; phone: string; reason: string }[]
}

interface RosterStatus {
  voterCount: number
  isSealed: boolean
  sealedAt: string | null
  votersHash: string | null
  sealedCount: number | null
}

const STORAGE_KEY = 'wwvs_admin_secret'

export default function AdminPage() {
  const [inputSecret, setInputSecret] = useState('')
  const [secret, setSecret] = useState<string | null>(null)
  const [authError, setAuthError] = useState('')
  const [isAuthLoading, setIsAuthLoading] = useState(false)

  const [elections, setElections] = useState<Election[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [rosterStatus, setRosterStatus] = useState<RosterStatus | null>(null)

  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isSealing, setIsSealing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const [uploadError, setUploadError] = useState('')
  const [confirmMsg, setConfirmMsg] = useState('')
  const [sealMsg, setSealMsg] = useState('')
  const [copiedHash, setCopiedHash] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (saved) setSecret(saved)
  }, [])

  const fetchElections = useCallback(async (s: string) => {
    const res = await fetch('/api/admin/elections', {
      headers: { Authorization: `Bearer ${s}` },
    })
    const data = await res.json()
    if (data.ok) setElections(data.elections)
  }, [])

  useEffect(() => {
    if (secret) fetchElections(secret)
  }, [secret, fetchElections])

  const fetchRosterStatus = useCallback(async (electionId: string) => {
    if (!secret || !electionId) return
    const res = await fetch(`/api/admin/roster-status/${electionId}`, {
      headers: { Authorization: `Bearer ${secret}` },
    })
    const data = await res.json()
    if (data.ok) setRosterStatus(data)
  }, [secret])

  useEffect(() => {
    if (selectedId) {
      setRosterStatus(null)
      setValidation(null)
      setConfirmMsg('')
      setSealMsg('')
      setUploadError('')
      fetchRosterStatus(selectedId)
    }
  }, [selectedId, fetchRosterStatus])

  const handleLogin = async () => {
    setAuthError('')
    setIsAuthLoading(true)
    try {
      const res = await fetch('/api/admin/verify-secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: inputSecret }),
      })
      const data = await res.json()
      if (data.ok) {
        sessionStorage.setItem(STORAGE_KEY, inputSecret)
        setSecret(inputSecret)
      } else {
        setAuthError('비밀번호가 올바르지 않습니다')
      }
    } catch {
      setAuthError('서버 연결 실패')
    } finally {
      setIsAuthLoading(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedId || !secret) return

    setUploadError('')
    setValidation(null)
    setConfirmMsg('')
    setIsUploading(true)

    const form = new FormData()
    form.append('file', file)
    form.append('electionId', selectedId)

    try {
      const res = await fetch('/api/admin/upload-roster', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
        body: form,
      })
      const data = await res.json()
      if (data.ok) {
        setValidation(data)
      } else {
        setUploadError(data.error ?? '업로드 실패')
      }
    } catch {
      setUploadError('네트워크 오류')
    } finally {
      setIsUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleConfirm = async () => {
    if (!validation || !selectedId || !secret) return
    if (validation.valid === 0) return

    setIsConfirming(true)
    setConfirmMsg('')
    try {
      const res = await fetch('/api/admin/confirm-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ electionId: selectedId, phones: validation.validPhones }),
      })
      const data = await res.json()
      if (data.ok) {
        setConfirmMsg(`✅ ${data.inserted}명 등록 완료`)
        setValidation(null)
        await fetchRosterStatus(selectedId)
      } else {
        setConfirmMsg(`❌ 오류: ${data.error}`)
      }
    } catch {
      setConfirmMsg('❌ 네트워크 오류')
    } finally {
      setIsConfirming(false)
    }
  }

  const handleSeal = async () => {
    if (!selectedId || !secret) return
    if (!window.confirm('선거인명부를 봉인하면 전화번호 추가/삭제가 불가능합니다.\n정말 봉인하시겠습니까?')) return

    setIsSealing(true)
    setSealMsg('')
    try {
      const res = await fetch(`/api/admin/seal-roster/${selectedId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
      })
      const data = await res.json()
      if (data.ok) {
        setSealMsg('봉인 완료')
        await fetchRosterStatus(selectedId)
      } else {
        setSealMsg(`❌ 오류: ${data.error}`)
      }
    } catch {
      setSealMsg('❌ 네트워크 오류')
    } finally {
      setIsSealing(false)
    }
  }

  const handleExport = async () => {
    if (!selectedId || !secret) return
    setIsExporting(true)
    try {
      const res = await fetch(`/api/admin/export-roster/${selectedId}`, {
        headers: { Authorization: `Bearer ${secret}` },
      })
      if (!res.ok) { setIsExporting(false); return }
      const blob = await res.blob()
      const disposition = res.headers.get('content-disposition') ?? ''
      const match = disposition.match(/filename\*=UTF-8''(.+)/)
      const filename = match ? decodeURIComponent(match[1]) : 'voters.xlsx'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silently fail
    } finally {
      setIsExporting(false)
    }
  }

  const copyHash = () => {
    if (!rosterStatus?.votersHash) return
    navigator.clipboard.writeText(rosterStatus.votersHash)
    setCopiedHash(true)
    setTimeout(() => setCopiedHash(false), 2000)
  }

  // ── Login screen ──────────────────────────────────────────────────────
  if (!secret) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-[400px]">
          <div className="text-center mb-8">
            <h1 className="text-xl font-bold text-[#1B2A6B]">WWVS 관리자 도구</h1>
            <div className="mt-1 h-0.5 w-12 bg-[#1B2A6B] mx-auto rounded-full" />
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">관리자 인증</h2>
            {authError && (
              <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                {authError}
              </div>
            )}
            <input
              type="password"
              placeholder="관리자 비밀번호"
              value={inputSecret}
              onChange={e => setInputSecret(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#1B2A6B] text-sm mb-3"
            />
            <button
              onClick={handleLogin}
              disabled={isAuthLoading || !inputSecret}
              className="w-full py-3 bg-[#1B2A6B] text-white text-sm font-semibold rounded-xl hover:bg-[#162359] disabled:opacity-50 transition-colors"
            >
              {isAuthLoading ? '확인 중...' : '로그인'}
            </button>
          </div>
        </div>
      </main>
    )
  }

  // ── Dashboard ─────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#1B2A6B]">WWVS 관리자 도구</h1>
        <button
          onClick={() => { sessionStorage.removeItem(STORAGE_KEY); setSecret(null) }}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          로그아웃
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-5">

        {/* ① 선거 선택 */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">① 선거 선택</h2>
          {elections.length === 0 ? (
            <p className="text-sm text-gray-400">선거 목록을 불러오는 중...</p>
          ) : (
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#1B2A6B] text-sm bg-white"
            >
              <option value="">— 선거를 선택하세요 —</option>
              {elections.map(el => (
                <option key={el.id} value={el.id}>
                  {el.title} ({el.status})
                </option>
              ))}
            </select>
          )}
        </section>

        {selectedId && (
          <>
            {/* ② 현재 명부 상태 */}
            <section className="bg-white rounded-2xl border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">② 명부 현황</h2>
              {!rosterStatus ? (
                <p className="text-sm text-gray-400">로딩 중...</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      rosterStatus.isSealed
                        ? 'bg-red-100 text-red-700'
                        : rosterStatus.voterCount > 0
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                    }`}>
                      {rosterStatus.isSealed ? '🔒 봉인됨' : rosterStatus.voterCount > 0 ? '📋 확정 전' : '비어있음'}
                    </span>
                    <span className="text-sm text-gray-700 font-medium">
                      등록 선거인: {rosterStatus.voterCount.toLocaleString()}명
                    </span>
                  </div>

                  {rosterStatus.isSealed && rosterStatus.votersHash && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                      <p className="text-xs text-gray-500 mb-1 font-medium">명부 해시 (SHA-256)</p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-gray-700 break-all flex-1">
                          {rosterStatus.votersHash}
                        </code>
                        <button
                          onClick={copyHash}
                          className="shrink-0 text-xs px-2.5 py-1 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
                        >
                          {copiedHash ? '복사됨' : '복사'}
                        </button>
                      </div>
                      {rosterStatus.sealedAt && (
                        <p className="text-xs text-gray-400 mt-1">
                          봉인 일시: {new Date(rosterStatus.sealedAt).toLocaleString('ko-KR')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* ③ 엑셀 업로드 (봉인 전에만) */}
            {rosterStatus && !rosterStatus.isSealed && (
              <section className="bg-white rounded-2xl border border-gray-100 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-1">③ 선거인 명부 업로드</h2>
                <p className="text-xs text-gray-400 mb-3">
                  .xlsx 파일의 "전화번호" 컬럼을 읽습니다. 010으로 시작하는 11자리 숫자만 유효합니다.
                </p>

                <label className={`flex items-center justify-center w-full h-24 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                  isUploading ? 'border-gray-200 bg-gray-50' : 'border-gray-300 hover:border-[#1B2A6B] hover:bg-blue-50'
                }`}>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleUpload}
                    disabled={isUploading}
                    className="hidden"
                  />
                  <div className="text-center">
                    {isUploading ? (
                      <p className="text-sm text-gray-400">검증 중...</p>
                    ) : (
                      <>
                        <p className="text-sm text-gray-600 font-medium">파일 선택 또는 드래그</p>
                        <p className="text-xs text-gray-400 mt-1">.xlsx / .xls</p>
                      </>
                    )}
                  </div>
                </label>

                {uploadError && (
                  <div className="mt-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                    {uploadError}
                  </div>
                )}

                {/* Validation preview */}
                {validation && (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        { label: '전체', value: validation.total, color: 'text-gray-700' },
                        { label: '등록 가능', value: validation.valid, color: 'text-green-600' },
                        { label: '형식 오류', value: validation.formatErrors, color: validation.formatErrors > 0 ? 'text-red-500' : 'text-gray-400' },
                        { label: '중복', value: validation.withinFileDups + validation.existingDups, color: (validation.withinFileDups + validation.existingDups) > 0 ? 'text-yellow-600' : 'text-gray-400' },
                      ].map(item => (
                        <div key={item.label} className="bg-gray-50 rounded-xl p-3 text-center">
                          <p className={`text-xl font-bold ${item.color}`}>{item.value.toLocaleString()}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
                        </div>
                      ))}
                    </div>

                    {validation.errorRows.length > 0 && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-gray-500 hover:text-gray-700 py-1">
                          오류 행 상세 ({validation.errorRows.length}건)
                        </summary>
                        <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-xl">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 text-gray-500">
                              <tr>
                                <th className="px-3 py-2 text-left">행</th>
                                <th className="px-3 py-2 text-left">전화번호</th>
                                <th className="px-3 py-2 text-left">사유</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {validation.errorRows.slice(0, 100).map((r, i) => (
                                <tr key={i}>
                                  <td className="px-3 py-1.5 text-gray-500">{r.row}</td>
                                  <td className="px-3 py-1.5 font-mono">{r.phone}</td>
                                  <td className="px-3 py-1.5 text-red-500">{r.reason}</td>
                                </tr>
                              ))}
                              {validation.errorRows.length > 100 && (
                                <tr>
                                  <td colSpan={3} className="px-3 py-2 text-gray-400 text-center">
                                    ... 외 {validation.errorRows.length - 100}건
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    )}

                    {validation.valid > 0 ? (
                      <button
                        onClick={handleConfirm}
                        disabled={isConfirming}
                        className="w-full py-3 bg-[#1B2A6B] text-white text-sm font-semibold rounded-xl hover:bg-[#162359] disabled:opacity-50 transition-colors"
                      >
                        {isConfirming ? '등록 중...' : `${validation.valid.toLocaleString()}명 명부 확정`}
                      </button>
                    ) : (
                      <p className="text-center text-sm text-gray-400 py-2">등록 가능한 번호가 없습니다</p>
                    )}
                  </div>
                )}

                {confirmMsg && (
                  <div className={`mt-3 px-4 py-3 rounded-xl text-sm ${
                    confirmMsg.startsWith('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'
                  }`}>
                    {confirmMsg}
                  </div>
                )}
              </section>
            )}

            {/* ④ 명부 봉인 (선거인 있고 봉인 전) */}
            {rosterStatus && !rosterStatus.isSealed && rosterStatus.voterCount > 0 && (
              <section className="bg-white rounded-2xl border border-gray-100 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-1">④ 명부 봉인</h2>
                <p className="text-xs text-gray-400 mb-3">
                  봉인 후에는 전화번호 추가·삭제가 불가능합니다. 투표 진행 상태(is_voted) 업데이트는 계속 허용됩니다.
                </p>
                <button
                  onClick={handleSeal}
                  disabled={isSealing}
                  className="w-full py-3 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {isSealing ? '봉인 중...' : `🔒 선거인명부 봉인 (${rosterStatus.voterCount.toLocaleString()}명)`}
                </button>
                {sealMsg && (
                  <p className={`mt-2 text-sm text-center ${sealMsg.startsWith('❌') ? 'text-red-500' : 'text-green-600'}`}>
                    {sealMsg}
                  </p>
                )}
              </section>
            )}

            {/* ⑤ 백업 엑셀 다운로드 */}
            {rosterStatus && rosterStatus.voterCount > 0 && (
              <section className="bg-white rounded-2xl border border-gray-100 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-1">⑤ 백업 엑셀 다운로드</h2>
                <p className="text-xs text-gray-400 mb-3">
                  선거인 목록(해시 처리된 전화번호), 투표 현황, 봉인 해시 등을 포함한 Excel 파일입니다.
                </p>
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="w-full py-3 bg-white border-2 border-[#1B2A6B] text-[#1B2A6B] text-sm font-semibold rounded-xl hover:bg-blue-50 disabled:opacity-50 transition-colors"
                >
                  {isExporting ? '생성 중...' : '📥 Excel 내보내기'}
                </button>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}
