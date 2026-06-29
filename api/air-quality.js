import {
  getSharedCache,
  readSharedCache,
  writeSharedCache
} from '../server/sharedCache.js'
import { logCacheMetric } from '../server/cacheMetrics.js'
import {
  UPSTREAM_BLOCK_KEY,
  blockUpstream,
  getRemainingBlockSeconds
} from '../server/upstreamBackoff.js'
import { fetchCoalesced } from '../server/coalescedFetch.js'
import {
  AIR_QUALITY_PARAMETER_CONFIG,
  buildCanonicalOpenMeteoParams
} from '../server/openMeteoParams.js'
import {
  AIR_QUALITY_FRESH_CACHE_TTL,
  STALE_CACHE_TTL
} from '../server/cachePolicy.js'
import { getCacheNamespace } from '../shared/cacheVersion.js'

const OPEN_METEO_ENDPOINT = 'https://air-quality-api.open-meteo.com/v1/air-quality'

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const canonical = buildCanonicalOpenMeteoParams(
    getRequestParams(request.query),
    AIR_QUALITY_PARAMETER_CONFIG
  )

  if (!canonical.params) {
    response.status(400).json({ error: canonical.error })
    return
  }

  const params = canonical.params
  const cacheKey = params.toString()
  const sharedCache = getSharedCache(getCacheNamespace('air-quality'))
  const cached = await readSharedCache(sharedCache, `fresh:${cacheKey}`)

  if (cached) {
    sendAirQuality(response, cached, 'runtime')
    return
  }

  logCacheMetric('air-quality', 'miss')

  const blockedUntil = await readSharedCache(sharedCache, UPSTREAM_BLOCK_KEY)
  const blockedFor = getRemainingBlockSeconds(blockedUntil)

  if (blockedFor > 0) {
    const stale = await readSharedCache(sharedCache, `stale:${cacheKey}`)

    if (stale) {
      sendAirQuality(response, stale, 'stale')
      return
    }

    sendRateLimited(response, blockedFor)
    return
  }

  try {
    const upstream = await fetchCoalesced(
      `air-quality:${cacheKey}`,
      `${OPEN_METEO_ENDPOINT}?${params.toString()}`,
      'Aether Air Quality Map'
    )

    if (upstream.ok) {
      const record = {
        body: upstream.body,
        contentType: upstream.contentType,
        rateLimitLimit: upstream.rateLimitLimit,
        rateLimitRemaining: upstream.rateLimitRemaining
      }

      await Promise.all([
        writeSharedCache(
          sharedCache,
          `fresh:${cacheKey}`,
          record,
          AIR_QUALITY_FRESH_CACHE_TTL
        ),
        writeSharedCache(sharedCache, `stale:${cacheKey}`, record, STALE_CACHE_TTL)
      ])
      sendAirQuality(response, record, 'upstream')
      return
    }

    let retryAfter

    if (upstream.status === 429) {
      retryAfter = await blockUpstream(
        sharedCache,
        upstream.retryAfter
      )
    }

    const stale = await readSharedCache(sharedCache, `stale:${cacheKey}`)

    if (stale) {
      sendAirQuality(response, stale, 'stale')
      return
    }

    response.status(upstream.status)
    response.setHeader('Content-Type', 'application/json')
    response.setHeader('Cache-Control', 'no-store')

    if (retryAfter) {
      response.setHeader('Retry-After', String(retryAfter))
    }

    sendBudgetHeaders(response, upstream)
    response.send(upstream.body)
  } catch {
    const stale = await readSharedCache(sharedCache, `stale:${cacheKey}`)

    if (stale) {
      sendAirQuality(response, stale, 'stale')
      return
    }

    response.status(502).json({ error: 'Air quality provider unavailable' })
  }
}

function sendAirQuality(response, record, cacheStatus) {
  if (cacheStatus === 'runtime') {
    logCacheMetric('air-quality', 'hit')
  } else if (cacheStatus === 'stale') {
    logCacheMetric('air-quality', 'stale')
  }

  response.status(200)
  response.setHeader('Content-Type', record.contentType)
  response.setHeader('Cache-Control', 'public, max-age=300')
  response.setHeader(
    'Vercel-CDN-Cache-Control',
    'public, s-maxage=3600, stale-while-revalidate=86400'
  )
  response.setHeader('X-Aether-Cache', cacheStatus)
  sendBudgetHeaders(response, record)

  if (cacheStatus === 'stale') {
    response.setHeader('X-Aether-Upstream-Budget', 'low')
  }

  response.send(record.body)
}

function sendRateLimited(response, retryAfter) {
  response.status(429)
  response.setHeader('Content-Type', 'application/json')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Retry-After', String(retryAfter))
  response.setHeader('X-Aether-Upstream-Budget', 'critical')
  response.json({
    error: 'Air quality provider rate limited',
    retryAfter
  })
}

function sendBudgetHeaders(response, record) {
  if (record.rateLimitLimit !== null && record.rateLimitLimit !== undefined) {
    response.setHeader('X-Aether-RateLimit-Limit', record.rateLimitLimit)
  }

  if (
    record.rateLimitRemaining !== null &&
    record.rateLimitRemaining !== undefined
  ) {
    response.setHeader(
      'X-Aether-RateLimit-Remaining',
      record.rateLimitRemaining
    )
  }
}

function getRequestParams(query) {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    const values = Array.isArray(value) ? value : [value]

    for (const item of values) {
      if (typeof item === 'string') {
        params.append(key, item)
      }
    }
  }

  return params
}
