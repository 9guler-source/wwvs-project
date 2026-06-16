// 1회 시도 — 실패 시 호출자가 pending_vote_completions에 큐잉
export async function trySendCompletionToAuth(originalRi: string): Promise<boolean> {
  const authServerUrl = process.env.AUTH_SERVER_URL!
  const secret = process.env.AUTH_TO_OPS_SECRET!

  try {
    const res = await fetch(`${authServerUrl}/api/internal/vote-completed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ originalRi }),
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch (e) {
    console.error('[trySendCompletionToAuth] failed', e)
    return false
  }
}
