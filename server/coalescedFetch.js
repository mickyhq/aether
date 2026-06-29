import { logCacheMetric } from './cacheMetrics.js'

const pendingRequests = new Map()

export function fetchCoalesced(
  key,
  url,
  userAgent,
  extraHeaders = {},
  metricsRoute = key.split(':', 1)[0]
) {
  const existing = pendingRequests.get(key)

  if (existing) {
    return existing
  }

  logCacheMetric(metricsRoute, 'upstream')

  const request = fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': userAgent,
      ...extraHeaders
    }
  })
    .then(async response => {
      const rateLimit = readRateLimit(response.headers)

      return {
        body: await response.text(),
        contentType: response.headers.get('content-type') ?? 'application/json',
        ok: response.ok,
        rateLimitLimit: rateLimit.limit,
        rateLimitRemaining: rateLimit.remaining,
        retryAfter: response.headers.get('retry-after'),
        status: response.status
      }
    })
    .finally(() => {
      if (pendingRequests.get(key) === request) {
        pendingRequests.delete(key)
      }
    })

  pendingRequests.set(key, request)

  return request
}

function readRateLimit(headers) {
  return {
    limit: readFirstHeader(headers, [
      'ratelimit-limit',
      'x-ratelimit-limit',
      'x-rate-limit-limit'
    ]),
    remaining: readFirstHeader(headers, [
      'ratelimit-remaining',
      'x-ratelimit-remaining',
      'x-rate-limit-remaining'
    ])
  }
}

function readFirstHeader(headers, names) {
  for (const name of names) {
    const value = headers.get(name)

    if (value !== null) {
      return value
    }
  }

  return null
}
