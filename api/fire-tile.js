import {
  buildFireTileUrl,
  parseFireTileCoordinates
} from '../server/fireTile.js'
import { fetchWithTimeout } from '../shared/fetchTimeout.js'

const FIRE_TILE_TIMEOUT_MS = 8000

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
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
    const upstream = await fetchWithTimeout(
      buildFireTileUrl(mapKey, tile),
      { headers: { Accept: 'image/png' } },
      FIRE_TILE_TIMEOUT_MS
    )

    if (!upstream.ok) {
      response.status(502).json({ error: 'NASA FIRMS tile unavailable' })
      return
    }

    const contentType = upstream.headers.get('content-type') ?? ''

    if (!contentType.includes('image/png')) {
      response.status(502).json({ error: 'NASA FIRMS returned an invalid tile' })
      return
    }

    const image = Buffer.from(await upstream.arrayBuffer())

    response.status(200)
    response.setHeader('Content-Type', 'image/png')
    response.setHeader('Cache-Control', 'public, max-age=300')
    response.setHeader(
      'Vercel-CDN-Cache-Control',
      'public, s-maxage=900, stale-while-revalidate=3600'
    )
    response.send(image)
  } catch {
    response.status(504).json({ error: 'NASA FIRMS tile timed out' })
  }
}

function getQueryValue(value) {
  return Array.isArray(value) ? value[0] : value
}
