import {
  readSharedCache,
  writeSharedCache
} from './sharedCache.js'

export async function loadCachedResource({
  cache,
  cacheKey,
  freshTtl,
  staleTtl,
  load,
  onFreshMiss
}) {
  const freshKey = `fresh:${cacheKey}`
  const staleKey = `stale:${cacheKey}`
  const fresh = await readSharedCache(cache, freshKey)

  if (fresh) {
    return {
      record: fresh,
      source: 'runtime'
    }
  }

  onFreshMiss?.()

  try {
    const record = await load()

    await Promise.all([
      writeSharedCache(cache, freshKey, record, freshTtl),
      writeSharedCache(cache, staleKey, record, staleTtl)
    ])

    return {
      record,
      source: 'upstream'
    }
  } catch (error) {
    const stale = await readSharedCache(cache, staleKey)

    if (stale) {
      return {
        record: stale,
        source: 'stale'
      }
    }

    throw error
  }
}
