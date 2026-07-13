import { fetchWithTimeout } from '../shared/fetchTimeout.js'

const pendingTiles = new Map()

export function fetchTileCoalesced(key, url, timeoutMs) {
  const existing = pendingTiles.get(key)

  if (existing) {
    return existing
  }

  const request = fetchWithTimeout(
    url,
    { headers: { Accept: 'image/png' } },
    timeoutMs
  ).then(async response => ({
    body: await response.arrayBuffer(),
    contentType: response.headers.get('content-type') ?? '',
    ok: response.ok,
    status: response.status
  })).finally(() => {
    if (pendingTiles.get(key) === request) {
      pendingTiles.delete(key)
    }
  })

  pendingTiles.set(key, request)

  return request
}
