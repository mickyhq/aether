import { writeSharedCache } from './sharedCache.js'

export const UPSTREAM_BLOCK_KEY = 'provider-blocked-until'

const DEFAULT_RETRY_AFTER_SECONDS = 15 * 60
const MAX_RETRY_AFTER_SECONDS = 24 * 60 * 60

export function getRemainingBlockSeconds(blockedUntil) {
  if (typeof blockedUntil !== 'number') {
    return 0
  }

  return Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000))
}

export function parseRetryAfter(value) {
  if (!value) {
    return DEFAULT_RETRY_AFTER_SECONDS
  }

  const seconds = Number(value)

  if (Number.isFinite(seconds)) {
    return clampRetryAfter(seconds)
  }

  const retryAt = Date.parse(value)

  if (Number.isNaN(retryAt)) {
    return DEFAULT_RETRY_AFTER_SECONDS
  }

  return clampRetryAfter(Math.ceil((retryAt - Date.now()) / 1000))
}

export async function blockUpstream(cache, retryAfter) {
  const retryAfterSeconds = parseRetryAfter(retryAfter)
  const blockedUntil = Date.now() + retryAfterSeconds * 1000

  await writeSharedCache(
    cache,
    UPSTREAM_BLOCK_KEY,
    blockedUntil,
    retryAfterSeconds
  )

  return retryAfterSeconds
}

function clampRetryAfter(seconds) {
  return Math.min(
    MAX_RETRY_AFTER_SECONDS,
    Math.max(1, Math.ceil(seconds))
  )
}
