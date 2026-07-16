import { getCacheNamespace } from '../shared/cacheVersion.js'
import { logCacheMetric } from '../server/cacheMetrics.js'
import { loadCachedResource } from '../server/cachedResource.js'
import {
  fetchGeocode,
  parseGeocodeRequest
} from '../server/geocodingProvider.js'
import { getSharedCache } from '../server/sharedCache.js'
import { SOURCE_REFRESH_SECONDS } from '../shared/cachePolicy.js'

const FRESH_TTL = 24 * 60 * 60
const STALE_TTL = 7 * 24 * 60 * 60

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const parsed = parseGeocodeRequest(getRequestParams(request.query))

  if (!parsed) {
    response.status(400).json({ error: 'Invalid geocoding request' })
    return
  }

  try {
    const result = await loadCachedResource({
      cache: getSharedCache(getCacheNamespace('geocoding')),
      cacheKey: parsed.cacheKey,
      freshTtl: FRESH_TTL,
      staleTtl: STALE_TTL,
      load: () => fetchGeocode(parsed),
      onFreshMiss: () => logCacheMetric('geocoding', 'miss')
    })

    if (result.source === 'runtime') {
      logCacheMetric('geocoding', 'hit')
    } else if (result.source === 'stale') {
      logCacheMetric('geocoding', 'stale')
    }

    response.setHeader('Cache-Control', 'public, max-age=3600')
    response.setHeader(
      'Vercel-CDN-Cache-Control',
      `public, s-maxage=${Math.max(FRESH_TTL, SOURCE_REFRESH_SECONDS)}, stale-while-revalidate=604800`
    )
    response.setHeader('X-Aether-Cache', result.source)
    response.status(200).json(result.record)
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : 'Geocoding unavailable'
    })
  }
}

function getRequestParams(query) {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    const item = Array.isArray(value) ? value[0] : value

    if (typeof item === 'string') {
      params.set(key, item)
    }
  }

  return params
}
