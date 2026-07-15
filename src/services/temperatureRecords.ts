import type { TemperatureRecords, WeatherLocation } from '../types/weather'
import { getClientCacheKey } from '../../shared/cacheVersion.js'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import {
  parseResponseJson,
  temperatureRecordsResponseSchema
} from '../schemas/serverResponses'

const CACHE_KEY = getClientCacheKey('temperature-records')
const CACHE_TTL = 32 * 24 * 60 * 60 * 1000

export async function fetchTemperatureRecords(
  location: WeatherLocation,
  signal?: AbortSignal
): Promise<TemperatureRecords> {
  const locationKey = getLocationKey(location)
  const cached = readCache()[locationKey]

  if (cached && Date.now() - cached.updatedAt < CACHE_TTL) {
    return cached.payload
  }

  const params = new URLSearchParams({
    history: 'temperature',
    latitude: String(location.latitude),
    longitude: String(location.longitude)
  })
  const response = await fetchWithTimeout(`/api/weather?${params.toString()}`, {
    signal
  })

  if (!response.ok) {
    if (cached) return cached.payload
    throw new Error(`Temperature history error ${response.status}`)
  }

  const payload = await parseResponseJson(
    response,
    temperatureRecordsResponseSchema,
    'Temperature history response'
  )

  writeCache(locationKey, payload)
  return payload
}

type CacheRecord = {
  updatedAt: number
  payload: TemperatureRecords
}

function getLocationKey(location: WeatherLocation) {
  return `${location.latitude.toFixed(3)}:${location.longitude.toFixed(3)}`
}

function readCache(): Record<string, CacheRecord> {
  try {
    return JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeCache(locationKey: string, payload: TemperatureRecords) {
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
