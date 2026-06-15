export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startRetryWorkers } = await import('./lib/retry-workers')
    startRetryWorkers()
  }
}
