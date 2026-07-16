import {
  getOfficialWarnings,
  parseWarningCoordinates,
  prepareWarningsForResponse
} from '../server/officialWarnings.js'
import { getSharedCache } from '../server/sharedCache.js'
import { logCacheMetric } from '../server/cacheMetrics.js'
import { loadCachedResource } from '../server/cachedResource.js'
import { getCacheNamespace } from '../shared/cacheVersion.js'

const FRESH_CACHE_TTL = 5 * 60
const STALE_CACHE_TTL = 20 * 60

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const coordinates = parseWarningCoordinates(
    getQueryValue(request.query.latitude),
    getQueryValue(request.query.longitude)
  )

  if (!coordinates) {
    response.status(400).json({ error: 'Invalid coordinates' })
    return
  }

  const cacheKey = `${coordinates.latitude.toFixed(3)}:${coordinates.longitude.toFixed(3)}`
  const cache = getSharedCache(getCacheNamespace('official-warnings'))

  try {
    const result = await loadCachedResource({
      cache,
      cacheKey,
      freshTtl: FRESH_CACHE_TTL,
      staleTtl: STALE_CACHE_TTL,
      load: () => getOfficialWarnings(
        coordinates.latitude,
        coordinates.longitude
      ),
      onFreshMiss: () => logCacheMetric('warnings', 'miss')
    })
    const payload = prepareWarningsForResponse(
      result.record,
      result.source === 'stale' ? 'grace' : 'live'
    )

    if (!payload) {
      response.status(502).json({
        error: 'Official warning grace period expired'
      })
      return
    }

    sendWarnings(response, payload, result.source)
  } catch {
    response.status(502).json({ error: 'Official warnings unavailable' })
  }
}

function sendWarnings(response, payload, cacheStatus) {
  if (cacheStatus === 'runtime') {
    logCacheMetric('warnings', 'hit')
  } else if (cacheStatus === 'stale') {
    logCacheMetric('warnings', 'stale')
  }

  response.status(200)
  response.setHeader('Cache-Control', 'private, max-age=30')
  response.setHeader(
    'Vercel-CDN-Cache-Control',
    'no-store'
  )
  response.setHeader('X-Aether-Cache', cacheStatus)
  response.json(payload)
}

function getQueryValue(value) {
  return Array.isArray(value) ? value[0] : value
}
