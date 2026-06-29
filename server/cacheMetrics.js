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
