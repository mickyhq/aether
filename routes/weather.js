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
import { logBackoffDiagnostic } from '../server/providerDiagnostics.js'
import { fetchMetNorwayWeather } from '../server/metNorwayWeather.js'
import { fetchNullschoolJetStream } from '../server/nullschoolJetStream.js'

const OPEN_METEO_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const OPEN_METEO_CUSTOMER_ENDPOINT =
  'https://customer-api.open-meteo.com/v1/forecast'

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
    const stale = await readStaleWeather(sharedCache, params)

    setBackoffHeaders(response, 'active', blockedFor)

    logBackoffDiagnostic({
      route: 'weather',
      provider: 'weather',
      state: 'active',
      retryAfterSeconds: blockedFor,
      cacheFallback: stale ? 'stale' : 'none'
    })

    if (await sendWeatherRecovery(response, sharedCache, params, stale)) {
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

    const stale = await readStaleWeather(sharedCache, params)

    if (retryAfter) {
      setBackoffHeaders(response, 'started', retryAfter)
      logBackoffDiagnostic({
        route: 'weather',
        provider: 'weather',
        state: 'started',
        retryAfterSeconds: retryAfter,
        cacheFallback: stale ? 'stale' : 'none'
      })
    }

    if (await sendWeatherRecovery(response, sharedCache, params, stale)) {
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
    const stale = await readStaleWeather(sharedCache, params)

    if (await sendWeatherRecovery(response, sharedCache, params, stale)) {
      return
    }

    response.status(502).json({ error: 'Weather provider unavailable' })
  }
}

async function sendWeatherRecovery(
  response,
  sharedCache,
  params,
  stale
) {
  if (stale && staleIncludesRequestedPressure(stale, params)) {
    sendWeather(response, stale, 'stale')
    return true
  }

  const fallback = await readNullschoolJetStreamFallback(
    sharedCache,
    params
  ) ?? await readCustomerJetStreamFallback(
    sharedCache,
    params
  ) ?? await readMetNorwayFallback(sharedCache, params)

  if (fallback) {
    sendWeather(response, fallback, 'upstream')
    return true
  }

  if (stale) {
    sendWeather(response, stale, 'stale')
    return true
  }

  return false
}

function staleIncludesRequestedPressure(record, params) {
  const needsCurrent = params.get('current')?.split(',').includes(
    'pressure_msl'
  ) ?? false
  const needsHourly = params.get('hourly')?.split(',').includes(
    'pressure_msl'
  ) ?? false

  if (!needsCurrent && !needsHourly) {
    return true
  }

  try {
    const parsed = JSON.parse(record.body)
    const payloads = Array.isArray(parsed) ? parsed : [parsed]

    return payloads.every(payload => (
      (!needsCurrent || Number.isFinite(payload?.current?.pressure_msl)) &&
      (!needsHourly || Array.isArray(payload?.hourly?.pressure_msl))
    ))
  } catch {
    return false
  }
}

async function readNullschoolJetStreamFallback(sharedCache, params) {
  if (!isJetStreamRequest(params)) {
    return null
  }

  try {
    const record = await fetchNullschoolJetStream(params)

    if (!record) {
      return null
    }

    const cacheKey = params.toString()

    await Promise.all([
      writeSharedCache(
        sharedCache,
        `fresh:${cacheKey}`,
        record,
        WEATHER_FRESH_CACHE_TTL
      ),
      writeSharedCache(
        sharedCache,
        `stale:${cacheKey}`,
        record,
        STALE_CACHE_TTL
      )
    ])

    return record
  } catch {
    return null
  }
}

async function readCustomerJetStreamFallback(sharedCache, params) {
  const apiKey = process.env.ECMWF_KEY?.trim()

  if (!apiKey || !isJetStreamRequest(params)) {
    return null
  }

  try {
    const customerParams = new URLSearchParams(params)
    const cacheKey = params.toString()

    customerParams.set('models', 'ecmwf_ifs')
    customerParams.set('apikey', apiKey)

    const upstream = await fetchCoalesced(
      `jet-stream:customer:${cacheKey}`,
      `${OPEN_METEO_CUSTOMER_ENDPOINT}?${customerParams}`,
      'Aether Jet Stream',
      {},
      'jet-stream'
    )

    if (!upstream.ok || !parseProviderBody(upstream.body, isJetStreamResponse)) {
      return null
    }

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
      writeSharedCache(
        sharedCache,
        `stale:${cacheKey}`,
        record,
        STALE_CACHE_TTL
      )
    ])

    return record
  } catch {
    return null
  }
}

async function readMetNorwayFallback(sharedCache, params) {
  if (isJetStreamRequest(params)) {
    return null
  }

  try {
    const record = await fetchMetNorwayWeather(params)

    if (!record) {
      return null
    }

    const cacheKey = params.toString()

    await Promise.all([
      writeSharedCache(
        sharedCache,
        `fresh:${cacheKey}`,
        record,
        WEATHER_FRESH_CACHE_TTL
      ),
      writeSharedCache(
        sharedCache,
        `stale:${cacheKey}`,
        record,
        STALE_CACHE_TTL
      )
    ])

    return record
  } catch {
    return null
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

async function readStaleWeather(sharedCache, params) {
  const cacheKey = params.toString()
  const stale = await readSharedCache(sharedCache, `stale:${cacheKey}`)

  if (stale) {
    return stale
  }

  const legacyParams = new URLSearchParams(params)

  removeField(legacyParams, 'current', 'pressure_msl')
  removeField(legacyParams, 'hourly', 'pressure_msl')

  const legacyKey = legacyParams.toString()

  return legacyKey === cacheKey
    ? null
    : readSharedCache(sharedCache, `stale:${legacyKey}`)
}

function removeField(params, parameter, field) {
  const fields = params.get(parameter)?.split(',') ?? []
  const filtered = fields.filter(value => value !== field)

  if (filtered.length > 0 && filtered.length !== fields.length) {
    params.set(parameter, filtered.join(','))
  }
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

function setBackoffHeaders(response, state, retryAfter) {
  response.setHeader('X-Aether-Backoff', state)
  response.setHeader('X-Aether-Backoff-Seconds', String(retryAfter))
}
