import L from 'leaflet'

const MAX_MERCATOR_LATITUDE = 85.05112878

export function clipTileToBounds(
  tile: HTMLElement,
  coordinates: L.Coords,
  bounds: L.LatLngBounds
) {
  const { top, right, bottom, left } = getClipInsets(coordinates, bounds)

  if (top + bottom >= 1 || left + right >= 1) {
    tile.style.visibility = 'hidden'
    return
  }

  const clip = `inset(${toPercent(top)} ${toPercent(right)} ${toPercent(bottom)} ${toPercent(left)})`

  tile.style.visibility = ''
  tile.style.clipPath = clip
  tile.style.setProperty('-webkit-clip-path', clip)
}

export function maskTileToBounds(
  tile: HTMLImageElement,
  coordinates: L.Coords,
  bounds: L.LatLngBounds
) {
  if (tile.dataset.aetherRegionMasked === 'true') {
    return false
  }

  const { top, right, bottom, left } = getClipInsets(coordinates, bounds)

  if (
    top + bottom >= 1 ||
    left + right >= 1 ||
    (top === 0 && right === 0 && bottom === 0 && left === 0) ||
    tile.naturalWidth === 0 ||
    tile.naturalHeight === 0
  ) {
    return false
  }

  const canvas = document.createElement('canvas')

  canvas.width = tile.naturalWidth
  canvas.height = tile.naturalHeight

  const context = canvas.getContext('2d')

  if (!context) {
    return false
  }

  try {
    context.drawImage(tile, 0, 0)
    context.clearRect(0, 0, canvas.width, Math.ceil(canvas.height * top))
    context.clearRect(
      0,
      Math.floor(canvas.height * (1 - bottom)),
      canvas.width,
      Math.ceil(canvas.height * bottom)
    )
    context.clearRect(0, 0, Math.ceil(canvas.width * left), canvas.height)
    context.clearRect(
      Math.floor(canvas.width * (1 - right)),
      0,
      Math.ceil(canvas.width * right),
      canvas.height
    )
    tile.dataset.aetherRegionMasked = 'true'
    tile.src = canvas.toDataURL('image/png')
    return true
  } catch {
    return false
  }
}

function getClipInsets(
  coordinates: L.Coords,
  bounds: L.LatLngBounds
) {
  const tileCount = 2 ** coordinates.z
  const west = longitudeToTile(bounds.getWest(), tileCount)
  const east = longitudeToTile(bounds.getEast(), tileCount)
  const north = latitudeToTile(bounds.getNorth(), tileCount)
  const south = latitudeToTile(bounds.getSouth(), tileCount)
  const top = clamp(north - coordinates.y, 0, 1)
  const right = clamp(coordinates.x + 1 - east, 0, 1)
  const bottom = clamp(coordinates.y + 1 - south, 0, 1)
  const left = clamp(west - coordinates.x, 0, 1)

  return { top, right, bottom, left }
}

function longitudeToTile(longitude: number, tileCount: number) {
  return (longitude + 180) / 360 * tileCount
}

function latitudeToTile(latitude: number, tileCount: number) {
  const limitedLatitude = clamp(
    latitude,
    -MAX_MERCATOR_LATITUDE,
    MAX_MERCATOR_LATITUDE
  )
  const radians = limitedLatitude * Math.PI / 180

  return (
    1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI
  ) / 2 * tileCount
}

function toPercent(value: number) {
  return `${(value * 100).toFixed(4)}%`
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}
