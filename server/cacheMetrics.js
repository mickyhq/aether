export function logCacheMetric(route, metric) {
  if (!process.env.VERCEL) {
    return
  }

  console.info(JSON.stringify({
    event: 'aether.cache',
    route,
    cacheHitCount: metric === 'hit' ? 1 : 0,
    cacheMissCount: metric === 'miss' ? 1 : 0,
    staleCount: metric === 'stale' ? 1 : 0,
    upstreamRequestCount: metric === 'upstream' ? 1 : 0
  }))
}

export function logProviderFailure(route, provider, error) {
  if (!process.env.VERCEL) {
    return
  }

  console.warn(JSON.stringify({
    event: 'aether.provider',
    route,
    provider,
    status: readStatus(error),
    providerFailureCount: 1,
    quotaAlertCount: 0
  }))
}

export function logQuotaAlert(route, provider, quota) {
  if (!process.env.VERCEL) {
    return
  }

  console.warn(JSON.stringify({
    event: 'aether.provider',
    route,
    provider,
    status: quota.status ?? null,
    quotaRemaining: quota.remaining,
    quotaLimit: quota.limit,
    quotaAlert: quota.level,
    providerFailureCount: 0,
    quotaAlertCount: 1
  }))
}

function readStatus(error) {
  return Number.isInteger(error?.status) ? error.status : null
}
