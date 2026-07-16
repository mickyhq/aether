import { fetchWithTimeout } from '../shared/fetchTimeout.js'
import { logCacheMetric } from './cacheMetrics.js'
import { logUpstreamDiagnostics } from './providerDiagnostics.js'

const pendingTiles = new Map()

export function fetchTileCoalesced(key, url, timeoutMs, metricsRoute = null) {
  const existing = pendingTiles.get(key)

  if (existing) {
    return existing
  }

  if (metricsRoute) {
    logCacheMetric(metricsRoute, 'upstream')
  }

  const request = fetchWithTimeout(
    url,
    { headers: { Accept: 'image/png' } },
    timeoutMs
  ).then(async response => {
    const upstream = {
      body: await response.arrayBuffer(),
      contentType: response.headers.get('content-type') ?? '',
      ok: response.ok,
      status: response.status,
      rateLimitLimit: readHeader(response.headers, [
        'ratelimit-limit',
        'x-ratelimit-limit'
      ]),
      rateLimitRemaining: readHeader(response.headers, [
        'ratelimit-remaining',
        'x-ratelimit-remaining'
      ]),
      retryAfter: response.headers.get('retry-after')
    }

    logUpstreamDiagnostics(
      metricsRoute ?? 'radar',
      metricsRoute ?? 'radar',
      upstream
    )

    return upstream
  }).finally(() => {
    if (pendingTiles.get(key) === request) {
      pendingTiles.delete(key)
    }
  })

  pendingTiles.set(key, request)

  return request
}

function readHeader(headers, names) {
  for (const name of names) {
    const value = headers.get(name)

    if (value !== null) {
      return value
    }
  }

  return null
}
