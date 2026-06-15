'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

interface Certificate {
  new_ri: string
  election_id: string
  selected_option_text: string
  hmac_signature: string
  created_at: string
}

export default function CertificatesPage() {
  const params = useParams()
  const electionId = params.electionId as string

  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    fetch(`/api/certificates/${electionId}?page=${page}&limit=100`)
      .then(r => r.json())
      .then(data => {
        if (data.certificates) {
          setCertificates(data.certificates)
          setTotal(data.total)
        } else {
          setError(data.error ?? '조회 실패')
        }
      })
      .catch(() => setError('네트워크 오류'))
      .finally(() => setIsLoading(false))
  }, [electionId, page])

  const filtered = certificates.filter(
    c =>
      !search ||
      c.new_ri.toLowerCase().includes(search.toLowerCase()) ||
      c.selected_option_text.includes(search),
  )

  const handleDownloadCsv = () => {
    const header = '공개용RI,선택항목,투표일시,HMAC서명'
    const rows = certificates.map(
      c =>
        `${c.new_ri},${c.selected_option_text},${new Date(c.created_at).toLocaleString('ko-KR')},${c.hmac_signature}`,
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wwvs_certificates_${electionId.slice(0, 8)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="min-h-screen px-4 pt-10 pb-16">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
          ← 목록으로
        </Link>

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-[#1B2A6B]">전체 투표확인서</h1>
            <p className="text-xs font-mono text-gray-400 mt-0.5">{electionId}</p>
          </div>
          <button
            onClick={handleDownloadCsv}
            disabled={certificates.length === 0}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            CSV 내보내기
          </button>
        </div>

        <div className="mb-4">
          <input
            type="text"
            placeholder="RI 또는 항목명으로 검색"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#1B2A6B] transition-colors text-sm"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-[#1B2A6B] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
            {error}
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-400 mb-3">
              총 {total.toLocaleString()}건 중 {filtered.length.toLocaleString()}건 표시
            </p>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 text-left">공개용RI (앞마크)</th>
                      <th className="px-4 py-3 text-left">선택 항목</th>
                      <th className="px-4 py-3 text-left">투표 일시</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map(c => (
                      <tr key={c.new_ri} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-[#1B2A6B]">
                          {c.new_ri.split('_')[0]}…
                        </td>
                        <td className="px-4 py-3 text-gray-700">{c.selected_option_text}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {new Date(c.created_at).toLocaleString('ko-KR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length === 0 && (
                <p className="text-center text-gray-400 py-8">검색 결과가 없습니다</p>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
