import type { OpenMeteoResponse, WeatherLocation } from '../types/weather'
import type { WeatherDataState } from '../types/weather'
import { getClientCacheKey } from '../../shared/cacheVersion.js'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import { isWeatherResponse } from '../../shared/providerValidation.js'
import { SOURCE_REFRESH_MS } from '../../shared/cachePolicy.js'

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
  'wind_speed_10m',
  'wind_direction_10m'
]
const HOURLY_FIELDS = [
  'temperature_2m',
  'precipitation',
  'snowfall',
  'weather_code',
  'cloud_cover',
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
  forceRefresh = false
): Promise<ForecastResult> {
  const cacheKey = getLocationCacheKey(location)
  const cachedForecast = readCachedForecast(cacheKey)
  const cachedAge = cachedForecast
    ? Date.now() - cachedForecast.updatedAt
    : Number.POSITIVE_INFINITY

  if (!forceRefresh && cachedForecast && cachedAge < FORECAST_FRESHNESS) {
    return {
      payload: cachedForecast.payload,
      source: 'cached'
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
    response = await fetchWithTimeout(`${OPEN_METEO_ENDPOINT}?${params.toString()}`)
  } catch (error) {
    if (cachedForecast && cachedAge < FORECAST_STALE_AGE) {
      return {
        payload: cachedForecast.payload,
        source: 'stale'
      }
    }

    throw error
  }

  if (!response.ok) {
    if (cachedForecast && cachedAge < FORECAST_STALE_AGE) {
      return {
        payload: cachedForecast.payload,
        source: 'stale'
      }
    }

    throw new Error(`Open-Meteo error ${response.status}`)
  }

  const payload = await response.json() as OpenMeteoResponse

  if (!isWeatherResponse(payload)) {
    throw new Error('Invalid Open-Meteo response')
  }

  writeCachedForecast(cacheKey, payload)

  return {
    payload,
    source: getResponseSource(response)
  }
}

type ForecastResult = {
  payload: OpenMeteoResponse
  source: Exclude<WeatherDataState, 'loading' | 'unavailable'>
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

function getLocationCacheKey(location: WeatherLocation) {
  return `${location.latitude.toFixed(3)}:${location.longitude.toFixed(3)}`
}

function readCachedForecast(cacheKey: string): ForecastCacheRecord | null {
  try {
    const cache = JSON.parse(
      window.localStorage.getItem(FORECAST_CACHE_KEY) ?? '{}'
    ) as Record<string, ForecastCacheRecord>

    return cache[cacheKey] ?? null
  } catch {
    return null
  }
}

function writeCachedForecast(cacheKey: string, payload: OpenMeteoResponse) {
  try {
    const cache = JSON.parse(
      window.localStorage.getItem(FORECAST_CACHE_KEY) ?? '{}'
    ) as Record<string, ForecastCacheRecord>
    const records = Object.entries({
      ...cache,
      [cacheKey]: {
        updatedAt: Date.now(),
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
