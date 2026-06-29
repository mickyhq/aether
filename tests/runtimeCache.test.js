import { expect, test } from 'vitest'
import { loadCachedResource } from '../server/cachedResource.js'

const FRESH_TTL = 60
const STALE_TTL = 300

test('returns a Runtime Cache hit without calling the provider', async () => {
  const cache = new FakeRuntimeCache()
  const cachedRecord = { value: 'cached' }
  let providerCalls = 0

  await cache.set('fresh:paris', cachedRecord, { ttl: FRESH_TTL })

  const result = await loadCachedResource({
    cache,
    cacheKey: 'paris',
    freshTtl: FRESH_TTL,
    staleTtl: STALE_TTL,
    load: async () => {
      providerCalls += 1
      return { value: 'live' }
    }
  })

  expect(result).toEqual({
    record: cachedRecord,
    source: 'runtime'
  })
  expect(providerCalls).toBe(0)
})

test('returns stale data when the provider fails', async () => {
  const cache = new FakeRuntimeCache()
  const staleRecord = { value: 'stale' }

  await cache.set('stale:paris', staleRecord, { ttl: STALE_TTL })

  const result = await loadCachedResource({
    cache,
    cacheKey: 'paris',
    freshTtl: FRESH_TTL,
    staleTtl: STALE_TTL,
    load: async () => {
      throw new Error('provider down')
    }
  })

  expect(result).toEqual({
    record: staleRecord,
    source: 'stale'
  })
})

test('throws when the provider fails and no stale data exists', async () => {
  const cache = new FakeRuntimeCache()

  await expect(
    loadCachedResource({
      cache,
      cacheKey: 'paris',
      freshTtl: FRESH_TTL,
      staleTtl: STALE_TTL,
      load: async () => {
        throw new Error('provider down')
      }
    })
  ).rejects.toThrow('provider down')
})

test('refreshes an expired entry and keeps a stale fallback', async () => {
  const cache = new FakeRuntimeCache()
  const oldRecord = { value: 'old' }
  const liveRecord = { value: 'live' }

  await cache.set('fresh:paris', oldRecord, { ttl: FRESH_TTL })
  await cache.set('stale:paris', oldRecord, { ttl: STALE_TTL })
  cache.advance(FRESH_TTL * 1000 + 1)

  const result = await loadCachedResource({
    cache,
    cacheKey: 'paris',
    freshTtl: FRESH_TTL,
    staleTtl: STALE_TTL,
    load: async () => liveRecord
  })

  expect(result).toEqual({
    record: liveRecord,
    source: 'upstream'
  })
  expect(await cache.get('fresh:paris')).toEqual(liveRecord)
  expect(await cache.get('stale:paris')).toEqual(liveRecord)
})

class FakeRuntimeCache {
  constructor() {
    this.entries = new Map()
    this.now = 0
  }

  advance(milliseconds) {
    this.now += milliseconds
  }

  async get(key) {
    const entry = this.entries.get(key)

    if (!entry || entry.expiresAt <= this.now) {
      this.entries.delete(key)
      return null
    }

    return entry.value
  }

  async set(key, value, options) {
    this.entries.set(key, {
      value,
      expiresAt: this.now + options.ttl * 1000
    })
  }
}
