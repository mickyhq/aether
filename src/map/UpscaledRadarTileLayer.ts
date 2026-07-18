import L from 'leaflet'

const TILE_SIZE = 256
const NATIVE_MAX_ZOOM = 7

export class UpscaledRadarTileLayer extends L.GridLayer {
  private readonly framePath: string

  constructor(framePath: string, options: L.GridLayerOptions) {
    super(options)
    this.framePath = framePath
  }

  protected createTile(coords: L.Coords, done: L.DoneCallback) {
    const canvas = document.createElement('canvas')
    const image = new Image()
    const native = getNativeTile(coords)

    canvas.width = TILE_SIZE
    canvas.height = TILE_SIZE
    image.alt = ''
    image.onload = () => {
      const context = canvas.getContext('2d')

      if (!context) {
        done(new Error('Radar tile canvas unavailable'), canvas)
        return
      }

      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(
        image,
        native.sourceX,
        native.sourceY,
        native.sourceSize,
        native.sourceSize,
        0,
        0,
        TILE_SIZE,
        TILE_SIZE
      )
      done(undefined, canvas)
    }
    image.onerror = () => {
      done(new Error('Radar tile unavailable'), canvas)
    }
    image.src = buildRadarTileUrl(
      this.framePath,
      native.zoom,
      native.x,
      native.y
    )

    return canvas
  }
}

function getNativeTile(coords: L.Coords) {
  if (coords.z <= NATIVE_MAX_ZOOM) {
    return {
      zoom: coords.z,
      x: coords.x,
      y: coords.y,
      sourceX: 0,
      sourceY: 0,
      sourceSize: TILE_SIZE
    }
  }

  const scale = 2 ** (coords.z - NATIVE_MAX_ZOOM)
  const sourceSize = TILE_SIZE / scale

  return {
    zoom: NATIVE_MAX_ZOOM,
    x: Math.floor(coords.x / scale),
    y: Math.floor(coords.y / scale),
    sourceX: (coords.x % scale) * sourceSize,
    sourceY: (coords.y % scale) * sourceSize,
    sourceSize
  }
}

function buildRadarTileUrl(
  path: string,
  zoom: number,
  x: number,
  y: number
) {
  return [
    '/api/radar',
    `?path=${encodeURIComponent(path)}`,
    `&z=${zoom}&x=${x}&y=${y}`
  ].join('')
}
