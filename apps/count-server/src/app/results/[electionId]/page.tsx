import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'

interface Result {
  optionId: string
  optionText: string
  voteCount: number
  percentage: number
}

async function getResults(electionId: string) {
  const { data } = await supabase
    .from('election_results')
    .select('option_id, option_text, vote_count, finalized_at')
    .eq('election_id', electionId)
    .order('vote_count', { ascending: false })

  if (!data?.length) return null

  const totalVotes = data.reduce((sum, r) => sum + r.vote_count, 0)
  return {
    finalizedAt: data[0].finalized_at,
    totalVotes,
    results: data.map(r => ({
      optionId: r.option_id,
      optionText: r.option_text,
      voteCount: r.vote_count,
      percentage: totalVotes > 0 ? Math.round((r.vote_count / totalVotes) * 1000) / 10 : 0,
    })) as Result[],
  }
}

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ electionId: string }>
}) {
  const { electionId } = await params
  const data = await getResults(electionId)

  if (!data) notFound()

  return (
    <main className="min-h-screen px-4 pt-10 pb-16">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
          ← 목록으로
        </Link>

        <div className="mb-8">
          <h1 className="text-xl font-bold text-[#1B2A6B]">선거 결과</h1>
          <p className="text-xs font-mono text-gray-400 mt-1">{electionId}</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-4 space-y-4">
          {data.results.map(r => (
            <div key={r.optionId}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-gray-800">{r.optionText}</span>
                <span className="text-gray-500">
                  {r.percentage}% ({r.voteCount.toLocaleString()}표)
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
                <div
                  className="h-4 bg-[#1B2A6B] rounded-full transition-all"
                  style={{ width: `${r.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between text-sm text-gray-500 px-1 mb-6">
          <span>총 투표수: {data.totalVotes.toLocaleString()}표</span>
          {data.finalizedAt && (
            <span>개표 완료: {new Date(data.finalizedAt).toLocaleString('ko-KR')}</span>
          )}
        </div>

        <div className="flex gap-3">
          <Link
            href="/verify"
            className="flex-1 text-center py-3 bg-[#1B2A6B] text-white text-sm font-semibold rounded-xl hover:bg-[#15235a] transition-colors"
          >
            내 투표 확인하기
          </Link>
          <Link
            href={`/certificates/${electionId}`}
            className="flex-1 text-center py-3 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors"
          >
            전체 확인서 보기
          </Link>
        </div>
      </div>
    </main>
  )
}
