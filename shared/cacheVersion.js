export const CACHE_VERSION = 6

export function getCacheNamespace(name) {
  return `aether-${name}-v${CACHE_VERSION}`
}

export function getClientCacheKey(name) {
  return `aether:cache:v${CACHE_VERSION}:${name}`
}
