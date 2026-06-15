import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface ElectionSummary {
  electionId: string
  totalVotes: number
  finalizedAt: string | null
}

async function getElectionSummaries(): Promise<ElectionSummary[]> {
  const { data } = await supabase
    .from('election_results')
    .select('election_id, vote_count, finalized_at')

  if (!data?.length) return []

  const grouped = new Map<string, ElectionSummary>()
  for (const row of data) {
    const existing = grouped.get(row.election_id)
    if (existing) {
      existing.totalVotes += row.vote_count
    } else {
      grouped.set(row.election_id, {
        electionId: row.election_id,
        totalVotes: row.vote_count,
        finalizedAt: row.finalized_at,
      })
    }
  }
  return Array.from(grouped.values())
}

export default async function HomePage() {
  const summaries = await getElectionSummaries()

  return (
    <main className="min-h-screen px-4 pt-10 pb-16">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-[#1B2A6B]">Who Whom Voting System</h1>
          <p className="text-gray-500 mt-1">공개 검증 포털</p>
        </div>

        <div className="flex gap-3 justify-center mb-10">
          <Link
            href="/verify"
            className="px-5 py-2.5 bg-[#1B2A6B] text-white text-sm font-semibold rounded-xl hover:bg-[#15235a] transition-colors"
          >
            내 투표 확인하기
          </Link>
        </div>

        {summaries.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
            공개된 선거 결과가 없습니다
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider px-1">
              개표 완료 선거
            </h2>
            {summaries.map(s => (
              <div
                key={s.electionId}
                className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center justify-between"
              >
                <div>
                  <p className="font-mono text-xs text-gray-400">{s.electionId.slice(0, 8)}…</p>
                  <p className="text-gray-700 mt-0.5">총 {s.totalVotes.toLocaleString()}표</p>
                  {s.finalizedAt && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(s.finalizedAt).toLocaleString('ko-KR')} 개표 완료
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/results/${s.electionId}`}
                    className="text-sm text-[#1B2A6B] font-semibold hover:underline"
                  >
                    결과 보기
                  </Link>
                  <span className="text-gray-300">|</span>
                  <Link
                    href={`/certificates/${s.electionId}`}
                    className="text-sm text-gray-500 hover:underline"
                  >
                    확인서 목록
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
