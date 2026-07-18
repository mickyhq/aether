import type { JetStreamSample } from '../types/weather'
import { isJetStreamSample } from '../schemas/cachePayloads'
import { normalizeLongitude } from '../utils/geo'
import { openStorage } from './storage'

type JetStreamCacheRecord = {
  key: string
  updatedAt: number
  sample: JetStreamSample
}

const STORE_NAME = 'jet-stream-samples'
const MAX_CACHE_AGE = 24 * 60 * 60 * 1000
const MAX_STORED_SAMPLES = 500

export async function loadPersistedJetStreamSamples() {
  const database = await openStorage()

  if (!database) {
    return []
  }

  return new Promise<JetStreamSample[]>(resolve => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).getAll()

    request.onsuccess = () => {
      const now = Date.now()
      const samples = (request.result as unknown[])
        .filter(isJetStreamCacheRecord)
        .filter(record => now - record.updatedAt <= MAX_CACHE_AGE)
        .map(record => ({
          ...record.sample,
          updatedAt: record.updatedAt
        }))

      resolve(samples)
    }
    request.onerror = () => resolve([])
  })
}

export async function persistJetStreamSamples(samples: JetStreamSample[]) {
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
          .filter(isJetStreamCacheRecord)
          .filter(record => Date.now() - record.updatedAt <= MAX_CACHE_AGE)
          .map(record => [record.key, record])
      )

      for (const sample of samples) {
        const key = getJetStreamCacheKey(sample.latitude, sample.longitude)

        records.set(key, {
          key,
          updatedAt: sample.updatedAt,
          sample
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

export function getJetStreamCacheKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(4)}:${normalizeLongitude(longitude).toFixed(4)}`
}

function isJetStreamCacheRecord(
  value: unknown
): value is JetStreamCacheRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const record = value as Partial<JetStreamCacheRecord>

  return typeof record.key === 'string' &&
    typeof record.updatedAt === 'number' &&
    Number.isFinite(record.updatedAt) &&
    isJetStreamSample(record.sample)
}
