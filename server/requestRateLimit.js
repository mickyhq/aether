const buckets = new Map()
const MAX_BUCKETS_BEFORE_CLEANUP = 5000

export function consumeRequestLimit(
  key,
  limit,
  windowMs,
  now = Date.now()
) {
  let bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs }
    buckets.set(key, bucket)
  }

  const allowed = bucket.count < limit

  if (allowed) {
    bucket.count += 1
  }

  if (buckets.size > MAX_BUCKETS_BEFORE_CLEANUP) {
    deleteExpiredBuckets(now)
  }

  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  }
}

export function getRequestClientId(request) {
  const realIp = request.headers?.['x-real-ip']

  if (Array.isArray(realIp)) {
    return realIp[0] ?? 'unknown'
  }

  return realIp || request.socket?.remoteAddress || 'unknown'
}

export function setRequestLimitHeaders(response, state) {
  response.setHeader('RateLimit-Limit', String(state.limit))
  response.setHeader('RateLimit-Remaining', String(state.remaining))
  response.setHeader('RateLimit-Reset', String(state.retryAfter))
}

function deleteExpiredBuckets(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }

  while (buckets.size > MAX_BUCKETS_BEFORE_CLEANUP) {
    const oldestKey = buckets.keys().next().value

    if (oldestKey === undefined) {
      return
    }

    buckets.delete(oldestKey)
  }
}
