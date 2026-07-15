import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import type { RadarRainReading } from '../types/weather'
import {
  parseResponseJson,
  radarMetadataResponseSchema
} from '../schemas/serverResponses'
import type { RadarFrame } from '../schemas/serverResponses'

type TilePoint = {
  z: number
  x: number
  y: number
  pixelX: number
  pixelY: number
}

type PixelTile = {
  data: Uint8ClampedArray
  width: number
}

type CacheEntry<T> = {
  value: Promise<T>
  touchedAt: number
}

const RADAR_ZOOM = 7
const TILE_SIZE = 256
const METADATA_MAX_AGE_MS = 4 * 60 * 1000
const MAX_FRAME_AGE_MS = 30 * 60 * 1000
const REQUEST_TIMEOUT_MS = 8000
const SAMPLE_DEADLINE_MS = 10000
const MIN_RAIN_ALPHA = 100
const MAX_TILE_CACHE_ENTRIES = 32
const tileCache = new Map<string, CacheEntry<PixelTile>>()
let metadataCache: { value: Promise<RadarFrame>; expiresAt: number } | null = null

export async function sampleRadarRainAt(
  latitude: number,
  longitude: number
): Promise<RadarRainReading> {
  let deadline = 0

  try {
    return await Promise.race([
      readRadarRainAt(latitude, longitude),
      new Promise<RadarRainReading>(resolve => {
        deadline = window.setTimeout(
          () => resolve({ status: 'unavailable' }),
          SAMPLE_DEADLINE_MS
        )
      })
    ])
  } finally {
    window.clearTimeout(deadline)
  }
}

async function readRadarRainAt(
  latitude: number,
  longitude: number
): Promise<RadarRainReading> {
  try {
    const frame = await getLatestFrame()
    const observedAt = new Date(frame.time * 1000).toISOString()

    if (Date.now() - frame.time * 1000 > MAX_FRAME_AGE_MS) {
      return { status: 'unavailable', observedAt }
    }

    const point = getTilePoint(latitude, longitude)
    const radarTile = await getPixelTile(
      `${frame.path}:${point.z}:${point.x}:${point.y}`,
      buildRadarTileUrl(frame.path, point)
    )
    const alpha = readAlpha(radarTile, point)
    if (alpha >= MIN_RAIN_ALPHA) {
      return { status: 'rain', observedAt }
    }

    const coverageTile = await getPixelTile(
      `coverage:${point.z}:${point.x}:${point.y}`,
      buildCoverageTileUrl(point)
    )
    const coverageAlpha = readAlpha(coverageTile, point)

    return coverageAlpha < 16
      ? { status: 'dry', observedAt }
      : { status: 'no-coverage', observedAt }
  } catch {
    return { status: 'unavailable' }
  }
}

export function getRadarSampleKey(latitude: number, longitude: number) {
  const point = getTilePoint(latitude, longitude)

  return `${point.z}:${point.x}:${point.y}:${point.pixelX}:${point.pixelY}`
}

async function getLatestFrame() {
  const now = Date.now()

  if (metadataCache && metadataCache.expiresAt > now) {
    return metadataCache.value
  }

  const value = fetchWithTimeout('/api/radar', {}, REQUEST_TIMEOUT_MS)
    .then(async response => {
      if (!response.ok) {
        throw new Error('Radar metadata unavailable')
      }

      const metadata = await parseResponseJson(
        response,
        radarMetadataResponseSchema,
        'Radar metadata response'
      )
      const frames = metadata.frames
      const frame = frames[frames.length - 1]

      if (!frame || !Number.isFinite(frame.time) || !frame.path) {
        throw new Error('Radar metadata invalid')
      }

      return frame
    })

  metadataCache = {
    value,
    expiresAt: now + METADATA_MAX_AGE_MS
  }

  value.catch(() => {
    if (metadataCache?.value === value) {
      metadataCache = null
    }
  })

  return value
}

async function getPixelTile(key: string, url: string) {
  const cached = tileCache.get(key)

  if (cached) {
    cached.touchedAt = Date.now()
    return cached.value
  }

  const value = fetchWithTimeout(url, {}, REQUEST_TIMEOUT_MS)
    .then(async response => {
      if (!response.ok) {
        throw new Error('Radar tile unavailable')
      }

      return decodeTile(await response.blob())
    })
  const entry = { value, touchedAt: Date.now() }

  tileCache.set(key, entry)
  trimTileCache()

  value.catch(() => {
    if (tileCache.get(key) === entry) {
      tileCache.delete(key)
    }
  })

  return value
}

async function decodeTile(blob: Blob): Promise<PixelTile> {
  const image = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')

  canvas.width = image.width
  canvas.height = image.height

  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    image.close()
    throw new Error('Radar canvas unavailable')
  }

  context.drawImage(image, 0, 0)
  image.close()

  return {
    data: context.getImageData(0, 0, canvas.width, canvas.height).data,
    width: canvas.width
  }
}

function getTilePoint(latitude: number, longitude: number): TilePoint {
  const safeLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude))
  const wrappedLongitude = ((longitude + 180) % 360 + 360) % 360 - 180
  const tileCount = 2 ** RADAR_ZOOM
  const xPosition = (wrappedLongitude + 180) / 360 * tileCount
  const latitudeRadians = safeLatitude * Math.PI / 180
  const yPosition = (
    1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI
  ) / 2 * tileCount
  const x = Math.floor(xPosition)
  const y = Math.max(0, Math.min(tileCount - 1, Math.floor(yPosition)))

  return {
    z: RADAR_ZOOM,
    x,
    y,
    pixelX: Math.max(0, Math.min(255, Math.floor((xPosition - x) * TILE_SIZE))),
    pixelY: Math.max(0, Math.min(255, Math.floor((yPosition - y) * TILE_SIZE)))
  }
}

function readAlpha(tile: PixelTile, point: TilePoint) {
  const offset = (point.pixelY * tile.width + point.pixelX) * 4

  return tile.data[offset + 3] ?? 0
}

function buildRadarTileUrl(path: string, point: TilePoint) {
  return [
    '/api/radar?sample=1',
    `path=${encodeURIComponent(path)}`,
    `z=${point.z}`,
    `x=${point.x}`,
    `y=${point.y}`
  ].join('&')
}

function buildCoverageTileUrl(point: TilePoint) {
  return [
    '/api/radar?coverage=1',
    `z=${point.z}`,
    `x=${point.x}`,
    `y=${point.y}`
  ].join('&')
}

function trimTileCache() {
  if (tileCache.size <= MAX_TILE_CACHE_ENTRIES) {
    return
  }

  const oldest = Array.from(tileCache.entries())
    .sort((left, right) => left[1].touchedAt - right[1].touchedAt)
    .slice(0, tileCache.size - MAX_TILE_CACHE_ENTRIES)

  for (const [key] of oldest) {
    tileCache.delete(key)
  }
}
