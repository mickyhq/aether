import L from 'leaflet'
import { buildTileFireMarkup } from './reportedFireMarker'

const DETECTION_CELL_SIZE = 7
const MAX_FLAMES_PER_TILE = 100

type AnimatedFireTileOptions = L.TileLayerOptions & {
  detectionBounds?: L.LatLngBoundsExpression
}

export class AnimatedFireTileLayer extends L.TileLayer {
  private readonly detectionBounds: L.LatLngBounds | null

  constructor(url: string, options: AnimatedFireTileOptions = {}) {
    const { detectionBounds, ...tileOptions } = options

    super(url, tileOptions)
    this.detectionBounds = detectionBounds
      ? detectionBounds instanceof L.LatLngBounds
        ? detectionBounds
        : L.latLngBounds(detectionBounds)
      : null
  }

  createTile(coords: L.Coords, done: L.DoneCallback): HTMLImageElement {
    const tile = document.createElement('div')
    const source = document.createElement('img')

    tile.className = 'animated-fire-tile'
    source.className = 'animated-fire-tile-source'
    source.alt = ''
    source.decoding = 'async'

    source.addEventListener('load', () => {
      try {
        const points = findDetectionPoints(source).filter(point => (
          !this.detectionBounds ||
          this.detectionBounds.contains(tilePointToLatLng(coords, point))
        ))

        points.forEach((point, index) => {
          const marker = document.createElement('span')

          marker.className = 'animated-fire-tile-marker'
          marker.style.left = `${point.x}px`
          marker.style.top = `${point.y}px`
          marker.innerHTML = buildTileFireMarkup(index + coords.x + coords.y)
          tile.append(marker)
        })
      } catch {
        tile.classList.add('is-fallback')
      }

      done(undefined, tile as unknown as HTMLImageElement)
    }, { once: true })

    source.addEventListener('error', () => {
      done(new Error('Fire tile unavailable'), tile as unknown as HTMLImageElement)
    }, { once: true })

    source.src = this.getTileUrl(coords)
    tile.append(source)

    return tile as unknown as HTMLImageElement
  }
}

function tilePointToLatLng(
  coords: L.Coords,
  point: { x: number; y: number }
) {
  const worldSize = 256 * 2 ** coords.z
  const worldX = coords.x * 256 + point.x
  const worldY = coords.y * 256 + point.y
  const longitude = worldX / worldSize * 360 - 180
  const mercator = Math.PI * (1 - 2 * worldY / worldSize)
  const latitude = Math.atan(Math.sinh(mercator)) * 180 / Math.PI

  return L.latLng(latitude, longitude)
}

function findDetectionPoints(image: HTMLImageElement) {
  const canvas = document.createElement('canvas')
  const width = image.naturalWidth
  const height = image.naturalHeight

  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    return []
  }

  context.drawImage(image, 0, 0)

  const pixels = context.getImageData(0, 0, width, height).data
  const columns = Math.ceil(width / DETECTION_CELL_SIZE)
  const activeCells = new Set<number>()

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const alpha = pixels[(y * width + x) * 4 + 3]

      if (alpha > 40) {
        const cellX = Math.floor(x / DETECTION_CELL_SIZE)
        const cellY = Math.floor(y / DETECTION_CELL_SIZE)

        activeCells.add(cellY * columns + cellX)
      }
    }
  }

  const points: Array<{ x: number; y: number }> = []

  while (activeCells.size > 0 && points.length < MAX_FLAMES_PER_TILE) {
    const first = activeCells.values().next().value as number
    const pending = [first]
    let totalX = 0
    let totalY = 0
    let count = 0

    activeCells.delete(first)

    while (pending.length > 0) {
      const cell = pending.pop() as number
      const cellX = cell % columns
      const cellY = Math.floor(cell / columns)

      totalX += cellX * DETECTION_CELL_SIZE + DETECTION_CELL_SIZE / 2
      totalY += cellY * DETECTION_CELL_SIZE + DETECTION_CELL_SIZE / 2
      count += 1

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const neighborX = cellX + offsetX
          const neighborY = cellY + offsetY
          const neighbor = neighborY * columns + neighborX

          if (
            neighborX >= 0 &&
            neighborX < columns &&
            neighborY >= 0 &&
            activeCells.delete(neighbor)
          ) {
            pending.push(neighbor)
          }
        }
      }
    }

    points.push({
      x: Math.min(width, totalX / count),
      y: Math.min(height, totalY / count)
    })
  }

  return points
}
