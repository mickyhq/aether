import {
  getOfficialHeatAlerts,
  parseHeatAlertCoordinates
} from '../server/heatAlerts.js'
import {
  getSharedCache
} from '../server/sharedCache.js'
import { logCacheMetric } from '../server/cacheMetrics.js'
import { loadCachedResource } from '../server/cachedResource.js'
import { getCacheNamespace } from '../shared/cacheVersion.js'

const FRESH_CACHE_TTL = 10 * 60
const STALE_CACHE_TTL = 24 * 60 * 60

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const coordinates = parseHeatAlertCoordinates(
    getQueryValue(request.query.latitude),
    getQueryValue(request.query.longitude)
  )

  if (!coordinates) {
    response.status(400).json({ error: 'Invalid coordinates' })
    return
  }

  const cacheKey = `${coordinates.latitude.toFixed(3)}:${coordinates.longitude.toFixed(3)}`
  const cache = getSharedCache(getCacheNamespace('heat-alerts'))

  try {
    const result = await loadCachedResource({
      cache,
      cacheKey,
      freshTtl: FRESH_CACHE_TTL,
      staleTtl: STALE_CACHE_TTL,
      load: async () => ({
        alerts: await getOfficialHeatAlerts(
          coordinates.latitude,
          coordinates.longitude
        )
      }),
      onFreshMiss: () => logCacheMetric('heat-alerts', 'miss')
    })

    sendAlerts(response, result.record, result.source)
  } catch {
    response.status(502).json({ error: 'Official heat alerts unavailable' })
  }
}

function sendAlerts(response, record, cacheStatus) {
  if (cacheStatus === 'runtime') {
    logCacheMetric('heat-alerts', 'hit')
  } else if (cacheStatus === 'stale') {
    logCacheMetric('heat-alerts', 'stale')
  }

  response.status(200)
  response.setHeader('Cache-Control', 'public, max-age=60')
  response.setHeader(
    'Vercel-CDN-Cache-Control',
    'public, s-maxage=600, stale-while-revalidate=86400'
  )
  response.setHeader('X-Aether-Cache', cacheStatus)
  response.json(record)
}

function getQueryValue(value) {
  return Array.isArray(value) ? value[0] : value
}
