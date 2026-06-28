const pendingRequests = new Map()

export function fetchCoalesced(key, url, userAgent, extraHeaders = {}) {
  const existing = pendingRequests.get(key)

  if (existing) {
    return existing
  }

  const request = fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': userAgent,
      ...extraHeaders
    }
  })
    .then(async response => ({
      body: await response.text(),
      contentType: response.headers.get('content-type') ?? 'application/json',
      ok: response.ok,
      retryAfter: response.headers.get('retry-after'),
      status: response.status
    }))
    .finally(() => {
      if (pendingRequests.get(key) === request) {
        pendingRequests.delete(key)
      }
    })

  pendingRequests.set(key, request)

  return request
}
