import { supabase } from './supabase'
import { sendCertificateToCount } from './send-to-count'
import { trySendCompletionToAuth } from './send-completion-to-auth'
import type { VoteCertificate } from '@wwvs/shared'

// 재시도 간격 (ms): 1s → 3s → 10s → 30s → 60s → 60s → ...
const RETRY_DELAYS_MS = [1_000, 3_000, 10_000, 30_000, 60_000]

function nextRetryDelayMs(retryCount: number): number {
  return RETRY_DELAYS_MS[Math.min(retryCount, RETRY_DELAYS_MS.length - 1)]
}

// 미전송 완료신호 재시도 — auth-server로 is_voted 갱신 요청
async function retryPendingCompletions(): Promise<void> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('pending_vote_completions')
    .select('id, original_ri, retry_count')
    .lte('next_retry_at', now)
    .limit(10)

  if (error) {
    console.error('[retry-workers] pending_vote_completions 조회 실패', error)
    return
  }

  for (const item of data ?? []) {
    const sent = await trySendCompletionToAuth(item.original_ri as string)
    if (sent) {
      await supabase.from('pending_vote_completions').delete().eq('id', item.id)
      console.log('[retry-workers] 완료신호 전달 성공', String(item.original_ri).slice(0, 8))
    } else {
      const count = (item.retry_count as number) + 1
      const delay = nextRetryDelayMs(count)
      const nextAt = new Date(Date.now() + delay).toISOString()
      await supabase
        .from('pending_vote_completions')
        .update({ retry_count: count, last_attempted_at: now, next_retry_at: nextAt })
        .eq('id', item.id)
    }
  }
}

// 미전송 확인서 재시도 — count-server로 재전송
// pending_certificates는 전송 실패 시에만 기록되며, 전송 성공 즉시 삭제되는 단기 재시도 큐임
async function retryPendingCertificates(): Promise<void> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('pending_certificates')
    .select('id, certificate_data, retry_count')
    .lte('next_retry_at', now)
    .limit(10)

  if (error) {
    console.error('[retry-workers] pending_certificates 조회 실패', error)
    return
  }

  for (const item of data ?? []) {
    const cert = item.certificate_data as VoteCertificate
    const sent = await sendCertificateToCount(cert)
    if (sent) {
      await supabase.from('pending_certificates').delete().eq('id', item.id)
      console.log('[retry-workers] 확인서 재전송 성공', cert.publicRi.split('_')[0])
    } else {
      const count = (item.retry_count as number) + 1
      const delay = nextRetryDelayMs(count)
      const nextAt = new Date(Date.now() + delay).toISOString()
      await supabase
        .from('pending_certificates')
        .update({ retry_count: count, last_attempted_at: now, next_retry_at: nextAt })
        .eq('id', item.id)
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __retryWorkersStarted: boolean | undefined
}

export function startRetryWorkers(): void {
  if (global.__retryWorkersStarted) return
  global.__retryWorkersStarted = true

  setInterval(() => {
    retryPendingCompletions().catch(e =>
      console.error('[retry-workers] completion error', e),
    )
    retryPendingCertificates().catch(e =>
      console.error('[retry-workers] certificate error', e),
    )
  }, 30_000)

  console.log('[retry-workers] 백그라운드 워커 시작 (30초 간격)')
}
