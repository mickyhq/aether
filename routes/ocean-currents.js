import { getCacheNamespace } from '../shared/cacheVersion.js'
import { logCacheMetric } from '../server/cacheMetrics.js'
import { loadCachedResource } from '../server/cachedResource.js'
import { fetchOceanCurrentGrid } from '../server/oceanCurrentProvider.js'
import { getSharedCache } from '../server/sharedCache.js'

const FRESH_TTL = 6 * 60 * 60
const STALE_TTL = 3 * 24 * 60 * 60

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const bounds = {
    north: Number(first(request.query.north)),
    south: Number(first(request.query.south)),
    east: Number(first(request.query.east)),
    west: Number(first(request.query.west)),
    width: Number(first(request.query.width)),
    height: Number(first(request.query.height))
  }

  if (!validBounds(bounds)) {
    response.status(400).json({ error: 'Invalid ocean-current viewport' })
    return
  }

  const cacheKey = [
    bounds.south.toFixed(2),
    bounds.west.toFixed(2),
    bounds.north.toFixed(2),
    bounds.east.toFixed(2),
    Math.round(bounds.width / 100),
    Math.round(bounds.height / 100)
  ].join(':')

  try {
    const result = await loadCachedResource({
      cache: getSharedCache(getCacheNamespace('ocean-currents')),
      cacheKey,
      freshTtl: FRESH_TTL,
      staleTtl: STALE_TTL,
      load: () => fetchOceanCurrentGrid(bounds),
      onFreshMiss: () => logCacheMetric('ocean-currents', 'miss')
    })

    if (result.source === 'runtime') {
      logCacheMetric('ocean-currents', 'hit')
    } else if (result.source === 'stale') {
      logCacheMetric('ocean-currents', 'stale')
    }

    response.setHeader('Cache-Control', 'public, max-age=900')
    response.setHeader(
      'Vercel-CDN-Cache-Control',
      'public, s-maxage=21600, stale-while-revalidate=259200'
    )
    response.setHeader('X-Aether-Cache', result.source)
    response.status(200).json(result.record)
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error
        ? error.message
        : 'Ocean currents unavailable'
    })
  }
}

function validBounds(bounds) {
  return (
    Object.values(bounds).every(Number.isFinite) &&
    bounds.north > bounds.south &&
    bounds.east > bounds.west &&
    bounds.north >= -90 &&
    bounds.north <= 90 &&
    bounds.south >= -90 &&
    bounds.south <= 90 &&
    bounds.east >= -180 &&
    bounds.east <= 180 &&
    bounds.west >= -180 &&
    bounds.west <= 180 &&
    bounds.width >= 1 &&
    bounds.width <= 10000 &&
    bounds.height >= 1 &&
    bounds.height <= 10000
  )
}

function first(value) {
  return Array.isArray(value) ? value[0] : value
}
