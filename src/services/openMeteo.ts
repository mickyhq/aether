import type { OpenMeteoResponse, WeatherLocation } from '../types/weather'

const OPEN_METEO_ENDPOINT = '/api/weather'
const FORECAST_CACHE_KEY = 'aether:forecast-cache'
const FORECAST_FRESHNESS = 5 * 60 * 1000
const FORECAST_STALE_AGE = 6 * 60 * 60 * 1000
const CURRENT_FIELDS = [
  'temperature_2m',
  'relative_humidity_2m',
  'precipitation',
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

export async function fetchOpenMeteoForecast(location: WeatherLocation): Promise<OpenMeteoResponse> {
  const cacheKey = getLocationCacheKey(location)
  const cachedForecast = readCachedForecast(cacheKey)

  if (cachedForecast && Date.now() - cachedForecast.updatedAt < FORECAST_FRESHNESS) {
    return cachedForecast.payload
  }

  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: CURRENT_FIELDS.join(','),
    hourly: HOURLY_FIELDS.join(','),
    forecast_days: '2'
  })

  const response = await fetch(`${OPEN_METEO_ENDPOINT}?${params.toString()}`)

  if (!response.ok) {
    if (cachedForecast && Date.now() - cachedForecast.updatedAt < FORECAST_STALE_AGE) {
      return cachedForecast.payload
    }

    throw new Error(`Open-Meteo error ${response.status}`)
  }

  const payload = await response.json() as OpenMeteoResponse

  writeCachedForecast(cacheKey, payload)

  return payload
}

type ForecastCacheRecord = {
  updatedAt: number
  payload: OpenMeteoResponse
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
