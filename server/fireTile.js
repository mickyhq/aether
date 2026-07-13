const TILE_SIZE = 256
const MAX_TILE_ZOOM = 12
const WEB_MERCATOR_LIMIT = 20037508.342789244

export function parseFireTileCoordinates(zValue, xValue, yValue) {
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

export function buildFireTileUrl(mapKey, tile) {
  const tileSpan = WEB_MERCATOR_LIMIT * 2 / (2 ** tile.z)
  const west = -WEB_MERCATOR_LIMIT + tile.x * tileSpan
  const east = west + tileSpan
  const north = WEB_MERCATOR_LIMIT - tile.y * tileSpan
  const south = north - tileSpan
  const params = new URLSearchParams({
    REQUEST: 'GetMap',
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    FORMAT: 'image/png',
    TRANSPARENT: 'true',
    SRS: 'EPSG:3857',
    WIDTH: String(TILE_SIZE),
    HEIGHT: String(TILE_SIZE),
    BBOX: `${west},${south},${east},${north}`
  })

  return `https://firms.modaps.eosdis.nasa.gov/mapserver/wms/fires/${encodeURIComponent(mapKey)}/fires_viirs_24/circle/5/255+82+40/?${params.toString()}`
}

function parseInteger(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null
  }

  const parsed = Number(value)

  return Number.isSafeInteger(parsed) ? parsed : null
}
