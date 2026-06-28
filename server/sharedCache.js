import { getCache } from '@vercel/functions'

export function getSharedCache(namespace) {
  if (!process.env.VERCEL) {
    return null
  }

  return getCache({ namespace })
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
    return
  }

  try {
    await cache.set(key, value, {
      name: key,
      ttl
    })
  } catch {
    return
  }
}
