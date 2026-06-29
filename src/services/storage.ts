/**
 * Shared IndexedDB storage for weather and air quality cache data.
 * Uses a single database with multiple object stores to avoid storage
 * limits and fragmentation.
 */

import { getCacheNamespace } from '../../shared/cacheVersion.js'

const DATABASE_NAME = getCacheNamespace('data')
const DATABASE_VERSION = 1
const STORES = ['weather-samples', 'air-quality-samples'] as const

let databasePromise: Promise<IDBDatabase | null> | null = null

export function openStorage(): Promise<IDBDatabase | null> {
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

      for (const name of STORES) {
        if (!database.objectStoreNames.contains(name)) {
          database.createObjectStore(name, { keyPath: 'key' })
        }
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })

  return databasePromise
}
