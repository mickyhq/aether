import { fetchCoalesced } from '../server/coalescedFetch.js'
import { fetchTileCoalesced } from '../server/coalescedTileFetch.js'
import { loadCachedResource } from '../server/cachedResource.js'
import { logCacheMetric } from '../server/cacheMetrics.js'
import { getSharedCache } from '../server/sharedCache.js'
import { getCacheNamespace } from '../shared/cacheVersion.js'
import { SOURCE_REFRESH_SECONDS } from '../shared/cachePolicy.js'

const METADATA_URL = 'https://api.rainviewer.com/public/weather-maps.json'
const TILE_HOST = 'https://tilecache.rainviewer.com'
const STALE_TTL = 24 * 60 * 60
const TILE_TIMEOUT_MS = 10000
const FRAME_PATH_PATTERN = /^\/v2\/radar\/\d+$/

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const path = getQueryValue(request.query.path)

  if (path !== undefined) {
    await sendRadarTile(request, response, path)
    return
  }

  await sendRadarMetadata(response)
}

async function sendRadarMetadata(response) {
  try {
    const result = await loadCachedResource({
      cache: getSharedCache(getCacheNamespace('radar-metadata')),
      cacheKey: 'current',
      freshTtl: SOURCE_REFRESH_SECONDS,
      staleTtl: STALE_TTL,
      onFreshMiss: () => logCacheMetric('radar-metadata', 'miss'),
      load: async () => {
        const upstream = await fetchCoalesced(
          'rainviewer:metadata',
          METADATA_URL,
          'Aether Weather Radar'
        )

        if (!upstream.ok) {
          throw new Error(`RainViewer metadata returned ${upstream.status}`)
        }

        const payload = JSON.parse(upstream.body)
        const frames = Array.isArray(payload?.radar?.past)
          ? payload.radar.past
              .filter(isRadarFrame)
              .slice(-6)
          : []

        if (frames.length === 0) {
          throw new Error('RainViewer metadata is empty')
        }

        return { frames }
      }
    })

    logResult('radar-metadata', result.source)
    setCacheHeaders(response, result.source)
    response.status(200).json(result.record)
  } catch {
    response.status(502).json({ error: 'Radar metadata unavailable' })
  }
}

async function sendRadarTile(request, response, path) {
  const tile = parseTile(
    path,
    getQueryValue(request.query.z),
    getQueryValue(request.query.x),
    getQueryValue(request.query.y)
  )

  if (!tile) {
    response.status(400).json({ error: 'Invalid radar tile' })
    return
  }

  const cacheKey = `${tile.path}:${tile.z}:${tile.x}:${tile.y}`

  try {
    const result = await loadCachedResource({
      cache: getSharedCache(getCacheNamespace('radar-tiles')),
      cacheKey,
      freshTtl: SOURCE_REFRESH_SECONDS,
      staleTtl: STALE_TTL,
      onFreshMiss: () => logCacheMetric('radar-tile', 'miss'),
      load: async () => {
        const upstream = await fetchTileCoalesced(
          `rainviewer:${cacheKey}`,
          `${TILE_HOST}${tile.path}/256/${tile.z}/${tile.x}/${tile.y}/2/1_1.png`,
          TILE_TIMEOUT_MS,
          'radar-tile'
        )

        if (!upstream.ok || !upstream.contentType.includes('image')) {
          throw new Error(`RainViewer tile returned ${upstream.status}`)
        }

        return {
          contentType: upstream.contentType,
          image: Buffer.from(upstream.body).toString('base64')
        }
      }
    })

    logResult('radar-tile', result.source)
    setCacheHeaders(response, result.source)
    response.setHeader('Content-Type', result.record.contentType)
    response.status(200).send(Buffer.from(result.record.image, 'base64'))
  } catch {
    response.status(502).json({ error: 'Radar tile unavailable' })
  }
}

function parseTile(path, zValue, xValue, yValue) {
  const z = parseInteger(zValue)
  const x = parseInteger(xValue)
  const y = parseInteger(yValue)

  if (
    typeof path !== 'string' ||
    !FRAME_PATH_PATTERN.test(path) ||
    z === null ||
    x === null ||
    y === null ||
    z > 7
  ) {
    return null
  }

  const tileCount = 2 ** z

  if (x >= tileCount || y >= tileCount) {
    return null
  }

  return { path, z, x, y }
}

function parseInteger(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null
  }

  const number = Number(value)

  return Number.isSafeInteger(number) ? number : null
}

function isRadarFrame(frame) {
  return (
    Number.isFinite(frame?.time) &&
    typeof frame?.path === 'string' &&
    FRAME_PATH_PATTERN.test(frame.path)
  )
}

function logResult(route, source) {
  if (source === 'runtime') {
    logCacheMetric(route, 'hit')
  } else if (source === 'stale') {
    logCacheMetric(route, 'stale')
  }
}

function setCacheHeaders(response, source) {
  response.setHeader('X-Aether-Cache', source)
  response.setHeader(
    'Cache-Control',
    `public, max-age=${SOURCE_REFRESH_SECONDS}`
  )
  response.setHeader(
    'Vercel-CDN-Cache-Control',
    `public, s-maxage=${SOURCE_REFRESH_SECONDS}, stale-while-revalidate=86400`
  )
}

function getQueryValue(value) {
  return Array.isArray(value) ? value[0] : value
}
