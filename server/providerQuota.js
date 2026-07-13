export function readProviderQuota(upstream) {
  const status = readNumber(upstream?.status)
  const remaining = readNumber(upstream?.rateLimitRemaining)
  const limit = readNumber(upstream?.rateLimitLimit)
  const retryAfter = readText(upstream?.retryAfter)
  let level = null

  if (status === 429 || remaining === 0) {
    level = 'critical'
  } else if (
    remaining !== null &&
    limit !== null &&
    limit > 0 &&
    remaining / limit <= 0.1
  ) {
    level = 'low'
  }

  return level ? { level, status, remaining, limit, retryAfter } : null
}

export function setProviderHeaders(response, providerFailures, quota) {
  response.setHeader('X-Aether-Provider-Failures', String(providerFailures))

  if (!quota) {
    return
  }

  response.setHeader('X-Aether-Quota-Alert', quota.level)

  if (quota.remaining !== null) {
    response.setHeader('X-Aether-Quota-Remaining', String(quota.remaining))
  }

  if (quota.limit !== null) {
    response.setHeader('X-Aether-Quota-Limit', String(quota.limit))
  }

  if (quota.retryAfter) {
    response.setHeader('Retry-After', quota.retryAfter)
  }
}

function readNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const number = Number(value)

  return Number.isFinite(number) && number >= 0 ? number : null
}

function readText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
