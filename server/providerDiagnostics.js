import { readProviderQuota } from './providerQuota.js'
import { parseRetryAfter } from './upstreamBackoff.js'

const PROVIDER_GROUPS = new Set([
  'weather',
  'air-quality',
  'radar',
  'geocoding',
  'noaa',
  'webcam',
  'astronomy'
])

export function logUpstreamDiagnostics(route, provider, upstream) {
  const group = normalizeProviderGroup(provider)
  const quota = readProviderQuota(upstream)
  const rateLimited = upstream?.status === 429

  if (!quota && !rateLimited) {
    return
  }

  writeDiagnostic({
    route,
    provider: group,
    status: Number.isInteger(upstream?.status) ? upstream.status : null,
    quotaLevel: quota?.level ?? null,
    quotaRemaining: quota?.remaining ?? null,
    quotaLimit: quota?.limit ?? null,
    backoffState: rateLimited ? 'provider-requested' : 'none',
    retryAfterSeconds: rateLimited
      ? parseRetryAfter(upstream?.retryAfter)
      : null,
    cacheFallback: 'unknown'
  })
}

export function logFetchDiagnostics(route, provider, response) {
  logUpstreamDiagnostics(route, provider, {
    status: response.status,
    rateLimitRemaining: readFirstHeader(response.headers, [
      'ratelimit-remaining',
      'x-ratelimit-remaining',
      'x-rate-limit-remaining'
    ]),
    rateLimitLimit: readFirstHeader(response.headers, [
      'ratelimit-limit',
      'x-ratelimit-limit',
      'x-rate-limit-limit'
    ]),
    retryAfter: response.headers.get('retry-after')
  })
}

export function logBackoffDiagnostic({
  route,
  provider,
  state,
  retryAfterSeconds,
  cacheFallback
}) {
  writeDiagnostic({
    route,
    provider: normalizeProviderGroup(provider),
    status: 429,
    quotaLevel: 'critical',
    quotaRemaining: null,
    quotaLimit: null,
    backoffState: state,
    retryAfterSeconds: finiteNonNegative(retryAfterSeconds),
    cacheFallback: cacheFallback === 'stale' ? 'stale' : 'none'
  })
}

function writeDiagnostic(diagnostic) {
  if (!process.env.VERCEL) {
    return
  }

  console.warn(JSON.stringify({
    event: 'aether.provider-diagnostic',
    ...diagnostic
  }))
}

function normalizeProviderGroup(provider) {
  if (PROVIDER_GROUPS.has(provider)) {
    return provider
  }

  if (provider === 'webcams') return 'webcam'
  if (provider?.startsWith('stargazing')) return 'astronomy'
  if (provider?.startsWith('radar') || provider === 'rainviewer') return 'radar'
  if (provider?.startsWith('ocean')) return 'noaa'

  return 'weather'
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

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null
}
