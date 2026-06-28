import {
  getOfficialHeatAlerts,
  parseHeatAlertCoordinates
} from '../server/heatAlerts.js'
import {
  getSharedCache,
  readSharedCache,
  writeSharedCache
} from '../server/sharedCache.js'

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
  const cache = getSharedCache('aether-heat-alerts-v2')
  const cached = await readSharedCache(cache, `fresh:${cacheKey}`)

  if (cached) {
    sendAlerts(response, cached, 'runtime')
    return
  }

  try {
    const record = {
      alerts: await getOfficialHeatAlerts(
        coordinates.latitude,
        coordinates.longitude
      )
    }

    await Promise.all([
      writeSharedCache(cache, `fresh:${cacheKey}`, record, FRESH_CACHE_TTL),
      writeSharedCache(cache, `stale:${cacheKey}`, record, STALE_CACHE_TTL)
    ])
    sendAlerts(response, record, 'upstream')
  } catch {
    const stale = await readSharedCache(cache, `stale:${cacheKey}`)

    if (stale) {
      sendAlerts(response, stale, 'stale')
      return
    }

    response.status(502).json({ error: 'Official heat alerts unavailable' })
  }
}

function sendAlerts(response, record, cacheStatus) {
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
