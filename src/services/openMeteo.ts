import type { OpenMeteoResponse, WeatherLocation } from '../types/weather'
import type { WeatherDataStatus } from '../types/weather'
import { getClientCacheKey } from '../../shared/cacheVersion.js'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import { SOURCE_REFRESH_MS } from '../../shared/cachePolicy.js'
import { openMeteoResponseSchema } from '../schemas/serverResponses'
import { readValidatedCacheRecords } from './cacheValidation'

const OPEN_METEO_ENDPOINT = '/api/weather'
const FORECAST_CACHE_KEY = getClientCacheKey('forecast')
const FORECAST_FRESHNESS = SOURCE_REFRESH_MS
const FORECAST_STALE_AGE = 24 * 60 * 60 * 1000
const CURRENT_FIELDS = [
  'temperature_2m',
  'relative_humidity_2m',
  'rain',
  'showers',
  'snowfall',
  'weather_code',
  'cloud_cover',
  'pressure_msl',
  'wind_speed_10m',
  'wind_direction_10m'
]
const HOURLY_FIELDS = [
  'temperature_2m',
  'precipitation',
  'snowfall',
  'weather_code',
  'cloud_cover',
  'pressure_msl',
  'wind_speed_10m',
  'wind_direction_10m'
]
const DAILY_FIELDS = [
  'temperature_2m_max',
  'temperature_2m_min',
  'apparent_temperature_max',
  'sunrise',
  'sunset'
]

export async function fetchOpenMeteoForecast(
  location: WeatherLocation,
  forceRefresh = false,
  signal?: AbortSignal
): Promise<ForecastResult> {
  const cacheKey = getLocationCacheKey(location)
  const cachedForecast = readCachedForecast(cacheKey)
  const cachedAge = cachedForecast
    ? Date.now() - cachedForecast.updatedAt
    : Number.POSITIVE_INFINITY

  if (!forceRefresh && cachedForecast && cachedAge < FORECAST_FRESHNESS) {
    return {
      payload: cachedForecast.payload,
      source: 'cached',
      refreshedAt: cachedForecast.updatedAt
    }
  }

  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: CURRENT_FIELDS.join(','),
    hourly: HOURLY_FIELDS.join(','),
    daily: DAILY_FIELDS.join(','),
    forecast_days: '7',
    timezone: 'auto'
  })

  let response: Response

  try {
    response = await fetchWithTimeout(
      `${OPEN_METEO_ENDPOINT}?${params.toString()}`,
      { signal }
    )
  } catch (error) {
    if (cachedForecast && cachedAge < FORECAST_STALE_AGE) {
      return {
        payload: cachedForecast.payload,
        source: 'stale',
        refreshedAt: cachedForecast.updatedAt
      }
    }

    throw error
  }

  if (!response.ok) {
    if (cachedForecast && cachedAge < FORECAST_STALE_AGE) {
      return {
        payload: cachedForecast.payload,
        source: 'stale',
        refreshedAt: cachedForecast.updatedAt
      }
    }

    throw new Error(`Open-Meteo error ${response.status}`)
  }

  const payload = openMeteoResponseSchema.parse(
    await response.json(),
    'Open-Meteo response'
  )

  if (Array.isArray(payload)) {
    throw new Error('Open-Meteo response has invalid data')
  }

  const refreshedAt = getResponseRefreshedAt(response)

  writeCachedForecast(cacheKey, payload, refreshedAt)

  return {
    payload,
    source: getResponseSource(response),
    refreshedAt
  }
}

type ForecastResult = {
  payload: OpenMeteoResponse
  source: Exclude<WeatherDataStatus, 'loading' | 'unavailable'>
  refreshedAt: number
}

type ForecastCacheRecord = {
  updatedAt: number
  payload: OpenMeteoResponse
}

function getResponseSource(
  response: Response
): ForecastResult['source'] {
  const vercelCache = response.headers.get('x-vercel-cache')?.toLowerCase()
  const aetherCache = response.headers.get('x-aether-cache')?.toLowerCase()
  const age = Number(response.headers.get('age') ?? 0)

  if (vercelCache === 'stale' || aetherCache === 'stale') {
    return 'stale'
  }

  if (
    vercelCache === 'hit' ||
    aetherCache === 'runtime' ||
    aetherCache === 'cached' ||
    age > 0
  ) {
    return 'cached'
  }

  return 'live'
}

function getResponseRefreshedAt(response: Response) {
  const ageSeconds = Number(response.headers.get('age') ?? 0)

  return Number.isFinite(ageSeconds) && ageSeconds > 0
    ? Date.now() - ageSeconds * 1000
    : Date.now()
}

function getLocationCacheKey(location: WeatherLocation) {
  return `${location.latitude.toFixed(3)}:${location.longitude.toFixed(3)}`
}

function readCachedForecast(cacheKey: string): ForecastCacheRecord | null {
  const cache = readValidatedCacheRecords(
    window.localStorage.getItem(FORECAST_CACHE_KEY),
    isSingleOpenMeteoResponse
  )

  return cache[cacheKey] ?? null
}

function writeCachedForecast(
  cacheKey: string,
  payload: OpenMeteoResponse,
  refreshedAt: number
) {
  try {
    const cache = readValidatedCacheRecords(
      window.localStorage.getItem(FORECAST_CACHE_KEY),
      isSingleOpenMeteoResponse
    )
    const records = Object.entries({
      ...cache,
      [cacheKey]: {
        updatedAt: refreshedAt,
        payload
      }
    })
      .sort(([, first], [, second]) => second.updatedAt - first.updatedAt)
      .slice(0, 10)

    window.localStorage.setItem(
      FORECAST_CACHE_KEY,
      JSON.stringify(Object.fromEntries(records))
    )
  } catch {
    return
  }
}

function isSingleOpenMeteoResponse(
  value: unknown
): value is OpenMeteoResponse {
  return !Array.isArray(value) && openMeteoResponseSchema.is(value)
}
