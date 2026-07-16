import {
  buildEffisTileUrl,
  parseEffisTileCoordinates
} from '../server/effisTile.js'
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

const EFFIS_TILE_TIMEOUT_MS = 12000
const FRESH_CACHE_TTL = SOURCE_REFRESH_SECONDS
const STALE_CACHE_TTL = 7 * 24 * 60 * 60
const METRICS_ROUTE = 'effis-fire-tile'
const PROVIDER = 'Copernicus EFFIS'

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const tile = parseEffisTileCoordinates(
    getQueryValue(request.query.z),
    getQueryValue(request.query.x),
    getQueryValue(request.query.y)
  )

  if (!tile) {
    response.status(400).json({ error: 'Invalid tile coordinates' })
    return
  }

  const cache = getSharedCache(getCacheNamespace('effis-fire-tiles'))
  const cacheKey = `viirs:${tile.z}:${tile.x}:${tile.y}`
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
            `effis:${cacheKey}`,
            buildEffisTileUrl(tile),
            EFFIS_TILE_TIMEOUT_MS,
            METRICS_ROUTE
          )

          quota = readProviderQuota(upstream)

          if (quota) {
            logQuotaAlert(METRICS_ROUTE, PROVIDER, quota)
          }

          if (!upstream.ok || !upstream.contentType.includes('image/png')) {
            throw Object.assign(
              new Error('Copernicus EFFIS tile unavailable'),
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
    `public, max-age=${SOURCE_REFRESH_SECONDS}`
  )
    response.setHeader(
      'Vercel-CDN-Cache-Control',
    `public, s-maxage=${SOURCE_REFRESH_SECONDS}, stale-while-revalidate=86400`
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
        ? 'Copernicus EFFIS tile unavailable'
        : 'Copernicus EFFIS tile timed out'
    })
  }
}

function getQueryValue(value) {
  return Array.isArray(value) ? value[0] : value
}
