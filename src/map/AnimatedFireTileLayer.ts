import L from 'leaflet'
import { buildTileFireMarkup } from './reportedFireMarker'

type AnimatedFireTileOptions = L.TileLayerOptions & {
  detectionBounds?: L.LatLngBoundsExpression
  useVisibilityBudget?: boolean
}

export class AnimatedFireTileLayer extends L.TileLayer {
  private readonly detectionBounds: L.LatLngBounds | null
  private renderToken = 0
  private renderedFlames = 0
  private mapRef: L.Map | null = null
  private readonly useVisibilityBudget: boolean
  private readonly handleMapViewChange = () => {
    this.renderToken += 1
    this.renderedFlames = 0
    this.redraw()
  }

  constructor(url: string, options: AnimatedFireTileOptions = {}) {
    const {
      detectionBounds,
      useVisibilityBudget = true,
      ...tileOptions
    } = options

    super(url, tileOptions)
    this.useVisibilityBudget = useVisibilityBudget
    this.detectionBounds = detectionBounds
      ? detectionBounds instanceof L.LatLngBounds
        ? detectionBounds
        : L.latLngBounds(detectionBounds)
      : null
  }

  onAdd(map: L.Map): this {
    super.onAdd(map)
    this.mapRef = map
    map.on('moveend', this.handleMapViewChange)

    return this
  }

  onRemove(map: L.Map): this {
    map.off('moveend', this.handleMapViewChange)
    this.mapRef = null
    super.onRemove(map)

    return this
  }

  createTile(coords: L.Coords, done: L.DoneCallback): HTMLImageElement {
    const tile = document.createElement('div')
    const source = document.createElement('img')
    const token = this.renderToken
    const maxFlames = this.useVisibilityBudget
      ? getMaxVisibleFlames(this.mapRef?.getZoom() ?? coords.z)
      : Number.POSITIVE_INFINITY

    tile.className = 'animated-fire-tile'
    source.className = 'animated-fire-tile-source'
    source.alt = ''
    source.decoding = 'async'

    source.addEventListener('load', () => {
      try {
        const remaining = maxFlames - this.renderedFlames

        if (token !== this.renderToken || remaining <= 0) {
          done(undefined, tile as unknown as HTMLImageElement)
          return
        }

        const points = findDetectionPoints(
          source,
          coords.z,
          this.useVisibilityBudget
        )
          .filter(point => (
            !this.detectionBounds ||
            this.detectionBounds.contains(tilePointToLatLng(coords, point))
          ))
          .slice(0, remaining)

        points.forEach((point, index) => {
          const marker = document.createElement('span')

          marker.className = 'animated-fire-tile-marker'
          marker.style.left = `${point.x}px`
          marker.style.top = `${point.y}px`
          marker.innerHTML = buildTileFireMarkup(index + coords.x + coords.y)
          tile.append(marker)
        })

        this.renderedFlames += points.length
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

function findDetectionPoints(
  image: HTMLImageElement,
  zoom: number,
  useVisibilityBudget: boolean
) {
  const canvas = document.createElement('canvas')
  const width = image.naturalWidth
  const height = image.naturalHeight
  const detectionCellSize = getDetectionCellSize(zoom)
  const maxPoints = useVisibilityBudget
    ? getMaxPointsPerTile(zoom)
    : Number.POSITIVE_INFINITY

  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    return []
  }

  context.drawImage(image, 0, 0)

  const pixels = context.getImageData(0, 0, width, height).data
  const columns = Math.ceil(width / detectionCellSize)
  const activeCells = new Set<number>()

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const alpha = pixels[(y * width + x) * 4 + 3]

      if (alpha > 40) {
        const cellX = Math.floor(x / detectionCellSize)
        const cellY = Math.floor(y / detectionCellSize)

        activeCells.add(cellY * columns + cellX)
      }
    }
  }

  const points: Array<{ x: number; y: number }> = []

  while (activeCells.size > 0 && points.length < maxPoints) {
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

      totalX += cellX * detectionCellSize + detectionCellSize / 2
      totalY += cellY * detectionCellSize + detectionCellSize / 2
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

function getDetectionCellSize(zoom: number) {
  if (zoom <= 4) {
    return 48
  }

  if (zoom <= 6) {
    return 28
  }

  if (zoom <= 8) {
    return 16
  }

  return 7
}

function getMaxPointsPerTile(zoom: number) {
  if (zoom <= 4) {
    return 1
  }

  if (zoom <= 6) {
    return 2
  }

  if (zoom <= 8) {
    return 4
  }

  if (zoom <= 10) {
    return 6
  }

  return 12
}

function getMaxVisibleFlames(zoom: number) {
  if (zoom <= 8) {
    return 7
  }

  return Number.POSITIVE_INFINITY
}
