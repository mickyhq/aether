import {
  getSharedCache,
  readSharedCache,
  writeSharedCache
} from '../server/sharedCache.js'

const OPEN_METEO_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const FRESH_CACHE_TTL = 10 * 60
const STALE_CACHE_TTL = 24 * 60 * 60
const ALLOWED_PARAMETERS = new Set([
  'latitude',
  'longitude',
  'current',
  'hourly',
  'forecast_days'
])
const COORDINATE_PATTERN = /^-?\d+(?:\.\d+)?(?:,-?\d+(?:\.\d+)?)*$/

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const latitude = getQueryValue(request.query.latitude)
  const longitude = getQueryValue(request.query.longitude)

  if (
    !latitude ||
    !longitude ||
    !COORDINATE_PATTERN.test(latitude) ||
    !COORDINATE_PATTERN.test(longitude)
  ) {
    response.status(400).json({ error: 'Invalid coordinates' })
    return
  }

  const latitudeCount = latitude.split(',').length
  const longitudeCount = longitude.split(',').length

  if (latitudeCount !== longitudeCount || latitudeCount > 40) {
    response.status(400).json({ error: 'Coordinate batch too large' })
    return
  }

  const params = new URLSearchParams()

  for (const key of ALLOWED_PARAMETERS) {
    const queryValue = getQueryValue(request.query[key])

    if (queryValue) {
      params.set(key, normalizeParameter(key, queryValue))
    }
  }

  const cacheKey = params.toString()
  const sharedCache = getSharedCache('aether-weather-v1')
  const cached = await readSharedCache(sharedCache, `fresh:${cacheKey}`)

  if (cached) {
    sendWeather(response, cached, 'runtime')
    return
  }

  try {
    const upstream = await fetchWithRetry(`${OPEN_METEO_ENDPOINT}?${params.toString()}`)
    const body = await upstream.text()

    if (upstream.ok) {
      const record = {
        body,
        contentType: upstream.headers.get('content-type') ?? 'application/json'
      }

      await Promise.all([
        writeSharedCache(sharedCache, `fresh:${cacheKey}`, record, FRESH_CACHE_TTL),
        writeSharedCache(sharedCache, `stale:${cacheKey}`, record, STALE_CACHE_TTL)
      ])
      sendWeather(response, record, 'upstream')
      return
    }

    const stale = await readSharedCache(sharedCache, `stale:${cacheKey}`)

    if (stale) {
      sendWeather(response, stale, 'stale')
      return
    }

    response.status(upstream.status)
    response.setHeader('Content-Type', 'application/json')
    response.setHeader('Cache-Control', 'no-store')
    response.send(body)
  } catch {
    const stale = await readSharedCache(sharedCache, `stale:${cacheKey}`)

    if (stale) {
      sendWeather(response, stale, 'stale')
      return
    }

    response.status(502).json({ error: 'Weather provider unavailable' })
  }
}

function sendWeather(response, record, cacheStatus) {
  response.status(200)
  response.setHeader('Content-Type', record.contentType)
  response.setHeader('Cache-Control', 'public, max-age=60')
  response.setHeader(
    'Vercel-CDN-Cache-Control',
    'public, s-maxage=600, stale-while-revalidate=86400'
  )
  response.setHeader('X-Aether-Cache', cacheStatus)
  response.send(record.body)
}

async function fetchWithRetry(url, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const upstream = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Aether Weather Map'
      }
    })

    if (upstream.status !== 429 || attempt === retries) {
      return upstream
    }

    const delay = (attempt + 1) * 500

    await new Promise(resolve => { setTimeout(resolve, delay) })
  }
}

function getQueryValue(value) {
  return Array.isArray(value) ? value[0] : value
}

function normalizeParameter(key, value) {
  if (key !== 'latitude' && key !== 'longitude') {
    return value
  }

  return value
    .split(',')
    .map(coordinate => Number(coordinate).toFixed(3))
    .join(',')
}
