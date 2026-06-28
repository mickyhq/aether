import {
  getSharedCache,
  readSharedCache,
  writeSharedCache
} from '../server/sharedCache.js'
import {
  UPSTREAM_BLOCK_KEY,
  blockUpstream,
  getRemainingBlockSeconds
} from '../server/upstreamBackoff.js'
import { fetchCoalesced } from '../server/coalescedFetch.js'
import {
  WEATHER_PARAMETER_CONFIG,
  buildCanonicalOpenMeteoParams
} from '../server/openMeteoParams.js'

const OPEN_METEO_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const FRESH_CACHE_TTL = 10 * 60
const STALE_CACHE_TTL = 24 * 60 * 60

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const canonical = buildCanonicalOpenMeteoParams(
    getRequestParams(request.query),
    WEATHER_PARAMETER_CONFIG
  )

  if (!canonical.params) {
    response.status(400).json({ error: canonical.error })
    return
  }

  const params = canonical.params
  const cacheKey = params.toString()
  const sharedCache = getSharedCache('aether-weather-v1')
  const cached = await readSharedCache(sharedCache, `fresh:${cacheKey}`)

  if (cached) {
    sendWeather(response, cached, 'runtime')
    return
  }

  const blockedUntil = await readSharedCache(sharedCache, UPSTREAM_BLOCK_KEY)
  const blockedFor = getRemainingBlockSeconds(blockedUntil)

  if (blockedFor > 0) {
    const stale = await readSharedCache(sharedCache, `stale:${cacheKey}`)

    if (stale) {
      sendWeather(response, stale, 'stale')
      return
    }

    sendRateLimited(response, blockedFor)
    return
  }

  try {
    const upstream = await fetchCoalesced(
      `weather:${cacheKey}`,
      `${OPEN_METEO_ENDPOINT}?${params.toString()}`,
      'Aether Weather Map'
    )

    if (upstream.ok) {
      const record = {
        body: upstream.body,
        contentType: upstream.contentType
      }

      await Promise.all([
        writeSharedCache(sharedCache, `fresh:${cacheKey}`, record, FRESH_CACHE_TTL),
        writeSharedCache(sharedCache, `stale:${cacheKey}`, record, STALE_CACHE_TTL)
      ])
      sendWeather(response, record, 'upstream')
      return
    }

    let retryAfter

    if (upstream.status === 429) {
      retryAfter = await blockUpstream(
        sharedCache,
        upstream.retryAfter
      )
    }

    const stale = await readSharedCache(sharedCache, `stale:${cacheKey}`)

    if (stale) {
      sendWeather(response, stale, 'stale')
      return
    }

    response.status(upstream.status)
    response.setHeader('Content-Type', 'application/json')
    response.setHeader('Cache-Control', 'no-store')

    if (retryAfter) {
      response.setHeader('Retry-After', String(retryAfter))
    }

    response.send(upstream.body)
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

function sendRateLimited(response, retryAfter) {
  response.status(429)
  response.setHeader('Content-Type', 'application/json')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Retry-After', String(retryAfter))
  response.json({
    error: 'Weather provider rate limited',
    retryAfter
  })
}

function getRequestParams(query) {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    const values = Array.isArray(value) ? value : [value]

    for (const item of values) {
      if (typeof item === 'string') {
        params.append(key, item)
      }
    }
  }

  return params
}
