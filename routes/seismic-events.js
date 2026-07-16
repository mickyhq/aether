import {
  getSeismicEvents,
  prepareSeismicEvents
} from '../server/seismicEvents.js'
import { getSharedCache } from '../server/sharedCache.js'
import { logCacheMetric, logProviderFailure } from '../server/cacheMetrics.js'
import { loadCachedResource } from '../server/cachedResource.js'
import { getCacheNamespace } from '../shared/cacheVersion.js'

const FRESH_CACHE_TTL = 60
const STALE_CACHE_TTL = 16 * 60
const METRICS_ROUTE = 'seismic-events'

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const result = await loadCachedResource({
      cache: getSharedCache(getCacheNamespace('seismic-events')),
      cacheKey: 'global',
      freshTtl: FRESH_CACHE_TTL,
      staleTtl: STALE_CACHE_TTL,
      load: getSeismicEvents,
      onFreshMiss: () => logCacheMetric(METRICS_ROUTE, 'miss')
    })
    const payload = prepareSeismicEvents(
      result.record,
      result.source === 'stale' ? 'grace' : 'live'
    )

    if (!payload) {
      response.status(502).json({ error: 'Seismic warning grace period expired' })
      return
    }

    if (result.source === 'runtime') {
      logCacheMetric(METRICS_ROUTE, 'hit')
    } else if (result.source === 'stale') {
      logCacheMetric(METRICS_ROUTE, 'stale')
    }

    response.status(200)
    response.setHeader('Cache-Control', 'private, max-age=30')
    response.setHeader('Vercel-CDN-Cache-Control', 'no-store')
    response.setHeader('X-Aether-Cache', result.source)
    response.json(payload)
  } catch (error) {
    logProviderFailure(
      METRICS_ROUTE,
      'USGS / NOAA Tsunami Warning Centers',
      error
    )
    response.status(502).json({ error: 'Seismic event feeds unavailable' })
  }
}
