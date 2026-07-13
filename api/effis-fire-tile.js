import {
  buildEffisTileUrl,
  parseEffisTileCoordinates
} from '../server/effisTile.js'
import { fetchWithTimeout } from '../shared/fetchTimeout.js'

const EFFIS_TILE_TIMEOUT_MS = 12000

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const tile = parseEffisTileCoordinates(
    getQueryValue(request.query.z),
    getQueryValue(request.query.x),
    getQueryValue(request.query.y)
  )

  if (!tile) {
    response.status(400).json({ error: 'Invalid tile coordinates' })
    return
  }

  try {
    const upstream = await fetchWithTimeout(
      buildEffisTileUrl(tile),
      { headers: { Accept: 'image/png' } },
      EFFIS_TILE_TIMEOUT_MS
    )
    const contentType = upstream.headers.get('content-type') ?? ''

    if (!upstream.ok || !contentType.includes('image/png')) {
      response.status(502).json({ error: 'Copernicus EFFIS tile unavailable' })
      return
    }

    response.status(200)
    response.setHeader('Content-Type', 'image/png')
    response.setHeader('Cache-Control', 'public, max-age=300')
    response.setHeader(
      'Vercel-CDN-Cache-Control',
      'public, s-maxage=900, stale-while-revalidate=3600'
    )
    response.send(Buffer.from(await upstream.arrayBuffer()))
  } catch {
    response.status(504).json({ error: 'Copernicus EFFIS tile timed out' })
  }
}

function getQueryValue(value) {
  return Array.isArray(value) ? value[0] : value
}
