import type { WeatherMapSample } from '../types/weather'
import { normalizeLongitude } from '../utils/geo'
import { openStorage } from './storage'
import { isWeatherMapSample } from '../schemas/cachePayloads'

type WeatherCacheRecord = {
  key: string
  updatedAt: number
  sample: WeatherMapSample
}

const STORE_NAME = 'weather-samples'
const MAX_CACHE_AGE = 6 * 60 * 60 * 1000
const MAX_STORED_SAMPLES = 1000

export async function loadPersistedWeatherSamples() {
  const database = await openStorage()

  if (!database) {
    return []
  }

  return new Promise<WeatherMapSample[]>(resolve => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).getAll()

    request.onsuccess = () => {
      const now = Date.now()
      const records = (request.result as unknown[])
        .filter(isWeatherCacheRecord)
        .filter(record => now - record.updatedAt <= MAX_CACHE_AGE)
        .map(record => ({
          ...record.sample,
          updatedAt: record.updatedAt
        }))

      resolve(records)
    }
    request.onerror = () => resolve([])
  })
}

export async function persistWeatherSamples(samples: WeatherMapSample[]) {
  const database = await openStorage()

  if (!database || samples.length === 0) {
    return
  }

  await new Promise<void>(resolve => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    const request = store.getAll()

    request.onsuccess = () => {
      const records = new Map(
        (request.result as unknown[])
          .filter(isWeatherCacheRecord)
          .filter(record => Date.now() - record.updatedAt <= MAX_CACHE_AGE)
          .map(record => [record.key, record])
      )

      for (const sample of samples) {
        const updatedAt = sample.updatedAt ?? Date.now()
        const key = getWeatherCacheKey(sample.latitude, sample.longitude)

        records.set(key, {
          key,
          updatedAt,
          sample: {
            ...sample,
            updatedAt
          }
        })
      }

      store.clear()

      for (const record of [...records.values()]
        .sort((first, second) => second.updatedAt - first.updatedAt)
        .slice(0, MAX_STORED_SAMPLES)) {
        store.put(record)
      }
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => resolve()
    transaction.onabort = () => resolve()
  })
}

export function getWeatherCacheKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(3)}:${normalizeLongitude(longitude).toFixed(3)}`
}

function isWeatherCacheRecord(value: unknown): value is WeatherCacheRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const record = value as Partial<WeatherCacheRecord>

  return typeof record.key === 'string' &&
    typeof record.updatedAt === 'number' &&
    Number.isFinite(record.updatedAt) &&
    isWeatherMapSample(record.sample)
}
