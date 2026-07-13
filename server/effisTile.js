const TILE_SIZE = 256
const MAX_TILE_ZOOM = 12

export function parseEffisTileCoordinates(zValue, xValue, yValue) {
  const z = parseInteger(zValue)
  const x = parseInteger(xValue)
  const y = parseInteger(yValue)

  if (z === null || x === null || y === null || z < 0 || z > MAX_TILE_ZOOM) {
    return null
  }

  const tileCount = 2 ** z

  if (x < 0 || y < 0 || x >= tileCount || y >= tileCount) {
    return null
  }

  return { z, x, y }
}

export function buildEffisTileUrl(tile, now = new Date()) {
  const tileCount = 2 ** tile.z
  const west = tile.x / tileCount * 360 - 180
  const east = (tile.x + 1) / tileCount * 360 - 180
  const north = tileLatitude(tile.y, tileCount)
  const south = tileLatitude(tile.y + 1, tileCount)
  const endDate = formatDate(now)
  const start = new Date(now)

  start.setUTCDate(start.getUTCDate() - 1)

  const params = new URLSearchParams({
    LAYERS: 'viirs.hs',
    FORMAT: 'image/png',
    TRANSPARENT: 'true',
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetMap',
    STYLES: '',
    SRS: 'EPSG:4326',
    BBOX: `${west},${south},${east},${north}`,
    WIDTH: String(TILE_SIZE),
    HEIGHT: String(TILE_SIZE),
    TIME: `${formatDate(start)}/${endDate}`
  })

  return `https://maps.effis.emergency.copernicus.eu/gwis?${params.toString()}`
}

function tileLatitude(y, tileCount) {
  const mercatorY = Math.PI * (1 - 2 * y / tileCount)

  return Math.atan(Math.sinh(mercatorY)) * 180 / Math.PI
}

function formatDate(date) {
  return date.toISOString().slice(0, 10)
}

function parseInteger(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null
  }

  const parsed = Number(value)

  return Number.isSafeInteger(parsed) ? parsed : null
}
