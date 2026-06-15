export async function registerRIToOps(
  ri: string,
  electionId: string,
  expiresAt: Date,
): Promise<boolean> {
  const opsServerUrl = process.env.OPS_SERVER_URL!
  const secret = process.env.AUTH_TO_OPS_SECRET!

  try {
    const res = await fetch(`${opsServerUrl}/api/internal/receive-ri`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        ri,
        electionId,
        expiresAt: expiresAt.toISOString(),
      }),
    })
    return res.ok
  } catch {
    return false
  }
}
