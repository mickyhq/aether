import { getCacheNamespace } from '../shared/cacheVersion.js'
import { logCacheMetric } from '../server/cacheMetrics.js'
import { loadCachedResource } from '../server/cachedResource.js'
import { fetchEcmwfForecast } from '../server/ecmwfProvider.js'
import { getSharedCache } from '../server/sharedCache.js'

const FRESH_TTL = 3 * 60 * 60
const STALE_TTL = 24 * 60 * 60

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const latitude = Number(first(request.query.latitude))
  const longitude = Number(first(request.query.longitude))
  const forecastHours = Math.min(
    360,
    Math.max(24, Number(first(request.query.forecast_hours)) || 120)
  )

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    response.status(400).json({ error: 'Invalid coordinates' })
    return
  }

  const cacheKey = [
    latitude.toFixed(3),
    longitude.toFixed(3),
    forecastHours
  ].join(':')

  try {
    const result = await loadCachedResource({
      cache: getSharedCache(getCacheNamespace('ecmwf')),
      cacheKey,
      freshTtl: FRESH_TTL,
      staleTtl: STALE_TTL,
      load: () => fetchEcmwfForecast(latitude, longitude, forecastHours),
      onFreshMiss: () => logCacheMetric('ecmwf', 'miss')
    })

    if (result.source === 'runtime') {
      logCacheMetric('ecmwf', 'hit')
    } else if (result.source === 'stale') {
      logCacheMetric('ecmwf', 'stale')
    }

    response.setHeader('Cache-Control', 'public, max-age=900')
    response.setHeader(
      'Vercel-CDN-Cache-Control',
      'public, s-maxage=10800, stale-while-revalidate=86400'
    )
    response.setHeader('X-Aether-Cache', result.source)
    response.status(200).json(result.record)
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error
        ? error.message
        : 'ECMWF forecast unavailable'
    })
  }
}

function first(value) {
  return Array.isArray(value) ? value[0] : value
}
