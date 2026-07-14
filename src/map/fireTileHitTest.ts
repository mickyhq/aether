import L from 'leaflet'
import type { MapFirePointer } from '../types/weather'

type FireTileHitTarget = {
  layer: L.TileLayer
  info: MapFirePointer
}

const tileContexts = new WeakMap<
  HTMLImageElement,
  CanvasRenderingContext2D | null
>()

export function findFireTileAtPoint(
  map: L.Map,
  point: L.Point,
  targets: FireTileHitTarget[]
) {
  const mapBounds = map.getContainer().getBoundingClientRect()
  const clientX = mapBounds.left + point.x
  const clientY = mapBounds.top + point.y

  for (const target of targets) {
    if (!map.hasLayer(target.layer)) {
      continue
    }

    const tiles = target.layer.getContainer()?.querySelectorAll<HTMLImageElement>(
      'img.leaflet-tile, img.animated-fire-tile-source'
    ) ?? []

    for (const tile of tiles) {
      if (isDetectionPixel(tile, clientX, clientY)) {
        return target.info
      }
    }
  }

  return null
}

function isDetectionPixel(
  tile: HTMLImageElement,
  clientX: number,
  clientY: number
) {
  if (!tile.complete || tile.naturalWidth === 0) {
    return false
  }

  const bounds = tile.getBoundingClientRect()

  if (
    clientX < bounds.left ||
    clientX > bounds.right ||
    clientY < bounds.top ||
    clientY > bounds.bottom ||
    bounds.width === 0 ||
    bounds.height === 0
  ) {
    return false
  }

  const context = getTileContext(tile)

  if (!context) {
    return false
  }

  const x = Math.floor(
    (clientX - bounds.left) / bounds.width * tile.naturalWidth
  )
  const y = Math.floor(
    (clientY - bounds.top) / bounds.height * tile.naturalHeight
  )
  const radius = 2
  const sampleX = Math.max(0, x - radius)
  const sampleY = Math.max(0, y - radius)
  const sampleWidth = Math.min(
    tile.naturalWidth - sampleX,
    radius * 2 + 1
  )
  const sampleHeight = Math.min(
    tile.naturalHeight - sampleY,
    radius * 2 + 1
  )

  try {
    const pixels = context.getImageData(
      sampleX,
      sampleY,
      sampleWidth,
      sampleHeight
    ).data

    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 32) {
        return true
      }
    }
  } catch {
    tileContexts.set(tile, null)
  }

  return false
}

function getTileContext(tile: HTMLImageElement) {
  if (tileContexts.has(tile)) {
    return tileContexts.get(tile) ?? null
  }

  try {
    const canvas = document.createElement('canvas')

    canvas.width = tile.naturalWidth
    canvas.height = tile.naturalHeight

    const context = canvas.getContext('2d', { willReadFrequently: true })

    context?.drawImage(tile, 0, 0)
    tileContexts.set(tile, context)

    return context
  } catch {
    tileContexts.set(tile, null)
    return null
  }
}
