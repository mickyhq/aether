import {
  buildFireTileUrl,
  parseFireTileCoordinates
} from '../server/fireTile.js'
import { fetchTileCoalesced } from '../server/coalescedTileFetch.js'
import { loadCachedResource } from '../server/cachedResource.js'
import {
  logCacheMetric,
  logProviderFailure,
  logQuotaAlert
} from '../server/cacheMetrics.js'
import { getSharedCache } from '../server/sharedCache.js'
import {
  readProviderQuota,
  setProviderHeaders
} from '../server/providerQuota.js'
import { getCacheNamespace } from '../shared/cacheVersion.js'
import { SOURCE_REFRESH_SECONDS } from '../shared/cachePolicy.js'
import {
  consumeRequestLimit,
  getRequestClientId,
  setRequestLimitHeaders
} from '../server/requestRateLimit.js'

const FIRE_TILE_TIMEOUT_MS = 8000
const FIRE_TILE_RATE_LIMIT = 240
const FIRE_TILE_RATE_WINDOW_MS = 60 * 1000
const FRESH_CACHE_TTL = SOURCE_REFRESH_SECONDS
const STALE_CACHE_TTL = 7 * 24 * 60 * 60
const METRICS_ROUTE = 'fire-tile'
const PROVIDER = 'NASA FIRMS'

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const rateLimit = consumeRequestLimit(
    `firms:${getRequestClientId(request)}`,
    FIRE_TILE_RATE_LIMIT,
    FIRE_TILE_RATE_WINDOW_MS
  )

  setRequestLimitHeaders(response, rateLimit)

  if (!rateLimit.allowed) {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Retry-After', String(rateLimit.retryAfter))
    response.status(429).json({ error: 'NASA FIRMS tile rate limit exceeded' })
    return
  }

  const tile = parseFireTileCoordinates(
    getQueryValue(request.query.z),
    getQueryValue(request.query.x),
    getQueryValue(request.query.y)
  )

  if (!tile) {
    response.status(400).json({ error: 'Invalid tile coordinates' })
    return
  }

  const mapKey = process.env.FIRMS_MAP_KEY

  if (!mapKey) {
    response.status(503).json({ error: 'Fire layer is not configured' })
    return
  }

  const cache = getSharedCache(getCacheNamespace('fire-tiles'))
  const cacheKey = `tsd-6:${tile.z}:${tile.x}:${tile.y}`
  let providerFailures = 0
  let quota = null

  try {
    const result = await loadCachedResource({
      cache,
      cacheKey,
      freshTtl: FRESH_CACHE_TTL,
      staleTtl: STALE_CACHE_TTL,
      onFreshMiss: () => logCacheMetric(METRICS_ROUTE, 'miss'),
      load: async () => {
        try {
          const upstream = await fetchTileCoalesced(
            `firms:${cacheKey}`,
            buildFireTileUrl(mapKey, tile),
            FIRE_TILE_TIMEOUT_MS,
            METRICS_ROUTE
          )

          quota = readProviderQuota(upstream)

          if (quota) {
            logQuotaAlert(METRICS_ROUTE, PROVIDER, quota)
          }

          if (!upstream.ok || !upstream.contentType.includes('image/png')) {
            throw Object.assign(
              new Error('NASA FIRMS tile unavailable'),
              { status: upstream.status }
            )
          }

          return {
            image: Buffer.from(upstream.body).toString('base64')
          }
        } catch (error) {
          providerFailures += 1
          logProviderFailure(METRICS_ROUTE, PROVIDER, error)
          throw error
        }
      }
    })

    if (result.source === 'runtime') {
      logCacheMetric(METRICS_ROUTE, 'hit')
    } else if (result.source === 'stale') {
      logCacheMetric(METRICS_ROUTE, 'stale')
    }

    response.status(200)
    response.setHeader('Content-Type', 'image/png')
    response.setHeader('X-Aether-Cache', result.source)
    setProviderHeaders(response, providerFailures, quota)
    response.setHeader(
      'Cache-Control',
      `public, max-age=${SOURCE_REFRESH_SECONDS}, stale-while-revalidate=3600`
    )
    response.setHeader(
      'Vercel-CDN-Cache-Control',
      `public, s-maxage=${SOURCE_REFRESH_SECONDS}, stale-while-revalidate=86400, stale-if-error=604800`
    )
    response.send(Buffer.from(result.record.image, 'base64'))
  } catch (error) {
    if (providerFailures === 0) {
      providerFailures = 1
      logProviderFailure(METRICS_ROUTE, PROVIDER, error)
    }

    setProviderHeaders(response, providerFailures, quota)
    response.status(error?.status ? 502 : 504).json({
      error: error?.status
        ? 'NASA FIRMS tile unavailable'
        : 'NASA FIRMS tile timed out'
    })
  }
}

function getQueryValue(value) {
  return Array.isArray(value) ? value[0] : value
}
