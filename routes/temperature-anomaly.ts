import { getCacheNamespace } from '../shared/cacheVersion.js'
import { logCacheMetric } from '../server/cacheMetrics.js'
import { loadCachedResource } from '../server/cachedResource.js'
import { getSharedCache } from '../server/sharedCache.js'
import { fetchTemperatureNormals } from '../server/temperatureAnomalyProvider.js'

type ApiRequest = {
  method?: string
  query: Record<string, string | string[] | undefined>
}

type ApiResponse = {
  setHeader: (name: string, value: string) => void
  status: (code: number) => ApiResponse
  json: (body: unknown) => ApiResponse
}

const FRESH_TTL = 365 * 24 * 60 * 60
const STALE_TTL = 2 * FRESH_TTL
const MAX_COORDINATES = 12

export const maxDuration = 60

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const coordinates = parseCoordinates(
    first(request.query.latitude),
    first(request.query.longitude)
  )
  const targetTime = new Date(first(request.query.time) ?? '')

  if (!coordinates || !Number.isFinite(targetTime.getTime())) {
    response.status(400).json({ error: 'Invalid temperature anomaly request' })
    return
  }

  const monthDayHour = targetTime.toISOString().slice(5, 13)
  const cacheKey = [
    monthDayHour,
    ...coordinates.map(point => (
      `${point.latitude.toFixed(4)}:${point.longitude.toFixed(4)}`
    ))
  ].join('|')

  try {
    const result = await loadCachedResource({
      cache: getSharedCache(getCacheNamespace('temperature-anomaly')),
      cacheKey,
      freshTtl: FRESH_TTL,
      staleTtl: STALE_TTL,
      load: () => fetchTemperatureNormals(coordinates, targetTime),
      onFreshMiss: () => logCacheMetric('temperature-anomaly', 'miss')
    })

    if (result.source === 'runtime') {
      logCacheMetric('temperature-anomaly', 'hit')
    } else if (result.source === 'stale') {
      logCacheMetric('temperature-anomaly', 'stale')
    }

    response.setHeader('Cache-Control', 'public, max-age=86400')
    response.setHeader(
      'Vercel-CDN-Cache-Control',
      `public, s-maxage=${FRESH_TTL}, stale-while-revalidate=${STALE_TTL}`
    )
    response.setHeader('X-Aether-Cache', result.source)
    response.status(200).json(result.record)
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error
        ? error.message
        : 'Temperature normals unavailable'
    })
  }
}

function parseCoordinates(latitudeValue?: string, longitudeValue?: string) {
  const latitudes = latitudeValue?.split(',').map(Number) ?? []
  const longitudes = longitudeValue?.split(',').map(Number) ?? []

  if (
    latitudes.length === 0 ||
    latitudes.length !== longitudes.length ||
    latitudes.length > MAX_COORDINATES
  ) {
    return null
  }

  const coordinates = latitudes.map((latitude, index) => ({
    latitude,
    longitude: longitudes[index]
  }))

  return coordinates.every(point => (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  )) ? coordinates : null
}

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value
}
