import {
  getSharedCache,
  readSharedCache,
  writeSharedCache
} from '../server/sharedCache.js'
import { logCacheMetric } from '../server/cacheMetrics.js'
import {
  getRequestParams,
  sendBudgetHeaders,
  sendProviderRateLimit,
  sendProviderRecord
} from '../server/providerResponse.js'
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
import {
  STALE_CACHE_TTL,
  WEATHER_FRESH_CACHE_TTL
} from '../server/cachePolicy.js'
import { getCacheNamespace } from '../shared/cacheVersion.js'
import { SOURCE_REFRESH_SECONDS } from '../shared/cachePolicy.js'
import {
  isJetStreamResponse,
  isWeatherResponse,
  parseProviderBody
} from '../shared/providerValidation.js'
import { handleTemperatureRecords } from '../server/temperatureRecords.js'
import { handleSoilMoisture } from '../server/soilMoisture.js'
import { handleWebcams } from '../server/webcams.js'
import { handleStargazing } from '../server/stargazing.js'

const OPEN_METEO_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (request.query.history === 'temperature') {
    await handleTemperatureRecords(request, response)
    return
  }

  if (request.query.history === 'soil-moisture') {
    await handleSoilMoisture(request, response)
    return
  }

  if (request.query.resource === 'webcams') {
    await handleWebcams(request, response)
    return
  }

  if (request.query.resource === 'stargazing') {
    await handleStargazing(request, response)
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
  const sharedCache = getSharedCache(getCacheNamespace('weather'))
  const cached = await readSharedCache(sharedCache, `fresh:${cacheKey}`)

  if (cached) {
    sendWeather(response, cached, 'runtime')
    return
  }

  logCacheMetric('weather', 'miss')

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

    const validateProviderBody = isJetStreamRequest(params)
      ? isJetStreamResponse
      : isWeatherResponse

    if (upstream.ok && parseProviderBody(upstream.body, validateProviderBody)) {
      const record = {
        body: upstream.body,
        contentType: upstream.contentType,
        rateLimitLimit: upstream.rateLimitLimit,
        rateLimitRemaining: upstream.rateLimitRemaining
      }

      await Promise.all([
        writeSharedCache(
          sharedCache,
          `fresh:${cacheKey}`,
          record,
          WEATHER_FRESH_CACHE_TTL
        ),
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

    const status = upstream.ok ? 502 : upstream.status
    const body = upstream.ok
      ? JSON.stringify({ error: 'Invalid weather provider response' })
      : upstream.body

    response.status(status)
    response.setHeader('Content-Type', 'application/json')
    response.setHeader('Cache-Control', 'no-store')

    if (retryAfter) {
      response.setHeader('Retry-After', String(retryAfter))
    }

    sendBudgetHeaders(response, upstream)
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

function isJetStreamRequest(params) {
  const current = params.get('current')?.split(',') ?? []

  return (
    current.length === 2 &&
    current.includes('wind_speed_250hPa') &&
    current.includes('wind_direction_250hPa') &&
    !params.has('hourly')
  )
}

function sendWeather(response, record, cacheStatus) {
  sendProviderRecord(response, record, cacheStatus, {
    route: 'weather',
    maxAge: SOURCE_REFRESH_SECONDS,
    sharedMaxAge: SOURCE_REFRESH_SECONDS
  })
}

function sendRateLimited(response, retryAfter) {
  sendProviderRateLimit(response, retryAfter, 'Weather')
}
