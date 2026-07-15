import type { StargazingForecast, WeatherLocation } from '../types/weather'
import { getClientCacheKey } from '../../shared/cacheVersion.js'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import {
  parseResponseJson,
  stargazingResponseSchema
} from '../schemas/serverResponses'

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

  const payload = await parseResponseJson(
    response,
    stargazingResponseSchema,
    'Stargazing forecast response'
  )

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
