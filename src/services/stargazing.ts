import type { StargazingForecast, WeatherLocation } from '../types/weather'
import { getClientCacheKey } from '../../shared/cacheVersion.js'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'

const CACHE_KEY = getClientCacheKey('stargazing')
const CACHE_TTL = 3 * 60 * 60 * 1000

export async function fetchStargazingForecast(
  location: WeatherLocation,
  signal?: AbortSignal
): Promise<StargazingForecast> {
  const locationKey = `${location.latitude.toFixed(3)}:${location.longitude.toFixed(3)}`
  const cached = readCache()[locationKey]

  if (cached && Date.now() - cached.updatedAt < CACHE_TTL) {
    return cached.payload
  }

  const params = new URLSearchParams({
    resource: 'stargazing',
    latitude: String(location.latitude),
    longitude: String(location.longitude)
  })
  const response = await fetchWithTimeout(`/api/weather?${params}`, { signal }, 15000)

  if (!response.ok) {
    if (cached) return cached.payload
    throw new Error(`Stargazing forecast error ${response.status}`)
  }

  const payload = await response.json() as StargazingForecast

  if (!isStargazingForecast(payload)) {
    throw new Error('Invalid stargazing forecast')
  }

  writeCache(locationKey, payload)
  return payload
}

type CacheRecord = {
  updatedAt: number
  payload: StargazingForecast
}

function readCache(): Record<string, CacheRecord> {
  try {
    return JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeCache(locationKey: string, payload: StargazingForecast) {
  try {
    const records = Object.entries({
      ...readCache(),
      [locationKey]: { updatedAt: Date.now(), payload }
    })
      .sort(([, first], [, second]) => second.updatedAt - first.updatedAt)
      .slice(0, 20)

    window.localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(records)))
  } catch {
    return
  }
}

function isStargazingForecast(value: unknown): value is StargazingForecast {
  if (!value || typeof value !== 'object') return false

  const forecast = value as StargazingForecast

  return (
    typeof forecast.initializedAt === 'string' &&
    Array.isArray(forecast.nights) &&
    forecast.nights.every(night => (
      typeof night.date === 'string' &&
      Number.isFinite(night.score) &&
      typeof night.rating === 'string' &&
      typeof night.bestTime === 'string' &&
      Number.isFinite(night.cloudCover) &&
      Number.isFinite(night.seeingArcseconds) &&
      Number.isFinite(night.transparency) &&
      Number.isFinite(night.moonIllumination)
    ))
  )
}
