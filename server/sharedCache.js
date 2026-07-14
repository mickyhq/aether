import { Redis } from '@upstash/redis'
import { getCache } from '@vercel/functions'

const localCaches = new Map()
const sharedCaches = new Map()

export function getSharedCache(namespace) {
  if (!sharedCaches.has(namespace)) {
    const fallback = createFallbackCache(namespace)
    const cache = hasUpstashCredentials()
      ? createUpstashCache(namespace, fallback)
      : fallback

    sharedCaches.set(namespace, cache)
  }

  return sharedCaches.get(namespace)
}

function createFallbackCache(namespace) {
  if (process.env.VERCEL) {
    return getCache({ namespace })
  }

  if (!localCaches.has(namespace)) {
    localCaches.set(namespace, createLocalCache())
  }

  return localCaches.get(namespace)
}

function hasUpstashCredentials() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  )
}

function createUpstashCache(namespace, fallback) {
  const redis = Redis.fromEnv()
  const prefix = `aether:${namespace}:`

  return {
    async get(key) {
      try {
        const value = await redis.get(`${prefix}${key}`)

        if (value !== null) {
          return value
        }
      } catch {
        // Fall through to Vercel Runtime Cache or local memory.
      }

      return fallback.get(key)
    },
    async set(key, value, options) {
      const writes = await Promise.allSettled([
        redis.set(`${prefix}${key}`, value, { ex: options.ttl }),
        fallback.set(key, value, options)
      ])

      const failure = writes.find(write => write.status === 'rejected')

      if (writes.every(write => write.status === 'rejected') && failure) {
        throw failure.reason
      }
    }
  }
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
