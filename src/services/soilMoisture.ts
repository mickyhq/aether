import type { SoilMoistureReading, WeatherLocation } from '../types/weather'
import { getClientCacheKey } from '../../shared/cacheVersion.js'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import {
  parseResponseJson,
  soilMoistureResponseSchema
} from '../schemas/serverResponses'
import { readValidatedCacheRecords } from './cacheValidation'

const CACHE_KEY = getClientCacheKey('soil-moisture')
const CACHE_TTL = 24 * 60 * 60 * 1000
const REQUEST_TIMEOUT = 25000
const MAX_ATTEMPTS = 2

export async function fetchSoilMoisture(
  location: WeatherLocation,
  signal?: AbortSignal
): Promise<SoilMoistureReading> {
  const locationKey = `${location.latitude.toFixed(3)}:${location.longitude.toFixed(3)}`
  const cached = readCache()[locationKey]

  if (cached && Date.now() - cached.updatedAt < CACHE_TTL) {
    return cached.payload
  }

  const params = new URLSearchParams({
    history: 'soil-moisture',
    latitude: String(location.latitude),
    longitude: String(location.longitude)
  })
  const url = `/api/weather?${params.toString()}`
  let lastError: unknown = new Error('Soil moisture unavailable')

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, { signal }, REQUEST_TIMEOUT)

      if (!response.ok) {
        lastError = new Error(`Soil moisture error ${response.status}`)

        if (response.status < 500 && response.status !== 429) break
        continue
      }

      const payload = await parseResponseJson(
        response,
        soilMoistureResponseSchema,
        'Soil moisture response'
      )

      writeCache(locationKey, payload)
      return payload
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error
    }
  }

  if (cached) return cached.payload
  throw lastError
}

type CacheRecord = {
  updatedAt: number
  payload: SoilMoistureReading
}

function readCache(): Record<string, CacheRecord> {
  return readValidatedCacheRecords(
    window.localStorage.getItem(CACHE_KEY),
    soilMoistureResponseSchema.is
  )
}

function writeCache(locationKey: string, payload: SoilMoistureReading) {
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
