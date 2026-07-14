import {
  getSharedCache,
  readSharedCache,
  writeSharedCache
} from '../server/sharedCache.js'
import { logCacheMetric } from '../server/cacheMetrics.js'
import {
  getRequestParams,
  sendBudgetHeaders,
  sendProviderRateLimit,
  sendProviderRecord
} from '../server/providerResponse.js'
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
import { SOURCE_REFRESH_SECONDS } from '../shared/cachePolicy.js'
import {
  isAirQualityResponse,
  parseProviderBody
} from '../shared/providerValidation.js'

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

    if (
      upstream.ok &&
      parseProviderBody(upstream.body, isAirQualityResponse)
    ) {
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

    const status = upstream.ok ? 502 : upstream.status
    const body = upstream.ok
      ? JSON.stringify({ error: 'Invalid air-quality provider response' })
      : upstream.body

    response.status(status)
    response.setHeader('Content-Type', 'application/json')
    response.setHeader('Cache-Control', 'no-store')

    if (retryAfter) {
      response.setHeader('Retry-After', String(retryAfter))
    }

    sendBudgetHeaders(response, upstream)
    response.send(body)
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
  sendProviderRecord(response, record, cacheStatus, {
    route: 'air-quality',
    maxAge: SOURCE_REFRESH_SECONDS,
    sharedMaxAge: SOURCE_REFRESH_SECONDS
  })
}

function sendRateLimited(response, retryAfter) {
  sendProviderRateLimit(response, retryAfter, 'Air quality')
}
