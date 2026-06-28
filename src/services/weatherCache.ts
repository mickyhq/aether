import type { WeatherMapSample } from '../types/weather'
import { normalizeLongitude } from '../utils/geo'

type WeatherCacheRecord = {
  key: string
  updatedAt: number
  sample: WeatherMapSample
}

const DATABASE_NAME = 'aether-weather'
const DATABASE_VERSION = 1
const STORE_NAME = 'weather-samples'
const MAX_CACHE_AGE = 6 * 60 * 60 * 1000

let databasePromise: Promise<IDBDatabase | null> | null = null

export async function loadPersistedWeatherSamples() {
  const database = await openDatabase()

  if (!database) {
    return []
  }

  return new Promise<WeatherMapSample[]>(resolve => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).getAll()

    request.onsuccess = () => {
      const now = Date.now()
      const records = (request.result as WeatherCacheRecord[])
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
  const database = await openDatabase()

  if (!database || samples.length === 0) {
    return
  }

  await new Promise<void>(resolve => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    for (const sample of samples) {
      const updatedAt = sample.updatedAt ?? Date.now()

      store.put({
        key: getWeatherCacheKey(sample.latitude, sample.longitude),
        updatedAt,
        sample: {
          ...sample,
          updatedAt
        }
      } satisfies WeatherCacheRecord)
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => resolve()
    transaction.onabort = () => resolve()
  })
}

export function getWeatherCacheKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(3)}:${normalizeLongitude(longitude).toFixed(3)}`
}

function openDatabase() {
  if (databasePromise) {
    return databasePromise
  }

  databasePromise = new Promise(resolve => {
    if (!('indexedDB' in window)) {
      resolve(null)
      return
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })

  return databasePromise
}

