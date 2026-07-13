import {
  buildFireTileUrl,
  parseFireTileCoordinates
} from '../server/fireTile.js'
import { fetchTileCoalesced } from '../server/coalescedTileFetch.js'
import {
  consumeRequestLimit,
  getRequestClientId,
  setRequestLimitHeaders
} from '../server/requestRateLimit.js'

const FIRE_TILE_TIMEOUT_MS = 8000
const FIRE_TILE_RATE_LIMIT = 240
const FIRE_TILE_RATE_WINDOW_MS = 60 * 1000

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const rateLimit = consumeRequestLimit(
    `firms:${getRequestClientId(request)}`,
    FIRE_TILE_RATE_LIMIT,
    FIRE_TILE_RATE_WINDOW_MS
  )

  setRequestLimitHeaders(response, rateLimit)

  if (!rateLimit.allowed) {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Retry-After', String(rateLimit.retryAfter))
    response.status(429).json({ error: 'NASA FIRMS tile rate limit exceeded' })
    return
  }

  const tile = parseFireTileCoordinates(
    getQueryValue(request.query.z),
    getQueryValue(request.query.x),
    getQueryValue(request.query.y)
  )

  if (!tile) {
    response.status(400).json({ error: 'Invalid tile coordinates' })
    return
  }

  const mapKey = process.env.FIRMS_MAP_KEY

  if (!mapKey) {
    response.status(503).json({ error: 'Fire layer is not configured' })
    return
  }

  try {
    const upstream = await fetchTileCoalesced(
      `firms:${tile.z}:${tile.x}:${tile.y}`,
      buildFireTileUrl(mapKey, tile),
      FIRE_TILE_TIMEOUT_MS
    )

    if (!upstream.ok) {
      response.status(502).json({ error: 'NASA FIRMS tile unavailable' })
      return
    }

    const contentType = upstream.contentType

    if (!contentType.includes('image/png')) {
      response.status(502).json({ error: 'NASA FIRMS returned an invalid tile' })
      return
    }

    const image = Buffer.from(upstream.body)

    response.status(200)
    response.setHeader('Content-Type', 'image/png')
    response.setHeader(
      'Cache-Control',
      'public, max-age=900, stale-while-revalidate=3600'
    )
    response.setHeader(
      'Vercel-CDN-Cache-Control',
      'public, s-maxage=900, stale-while-revalidate=86400, stale-if-error=604800'
    )
    response.send(image)
  } catch {
    response.status(504).json({ error: 'NASA FIRMS tile timed out' })
  }
}

function getQueryValue(value) {
  return Array.isArray(value) ? value[0] : value
}
