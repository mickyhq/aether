import { getCache } from '@vercel/functions'

const localCaches = new Map()

export function getSharedCache(namespace) {
  if (!process.env.VERCEL) {
    if (!localCaches.has(namespace)) {
      localCaches.set(namespace, createLocalCache())
    }

    return localCaches.get(namespace)
  }

  return getCache({ namespace })
}

function createLocalCache() {
  const records = new Map()

  return {
    async get(key) {
      const record = records.get(key)

      if (!record || record.expiresAt <= Date.now()) {
        records.delete(key)
        return null
      }

      return record.value
    },
    async set(key, value, options) {
      records.set(key, {
        expiresAt: Date.now() + options.ttl * 1000,
        value
      })
    }
  }
}

export async function readSharedCache(cache, key) {
  if (!cache) {
    return null
  }

  try {
    return await cache.get(key)
  } catch {
    return null
  }
}

export async function writeSharedCache(cache, key, value, ttl) {
  if (!cache) {
    return false
  }

  try {
    await cache.set(key, value, {
      name: key,
      ttl
    })
    return true
  } catch {
    return false
  }
}
