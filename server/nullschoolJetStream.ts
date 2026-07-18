import { fetchWithTimeout } from '../shared/fetchTimeout.js'

const NULLSCHOOL_JET_STREAM_URL =
  'https://gaia.nullschool.net/data/gfs/current/' +
  'current-wind-isobaric-250hPa-gfs-0.5.epak'
const CACHE_AGE = 30 * 60 * 1000

type Sequence = {
  start: number
  delta: number
  size: number
}

type EpakVariable = {
  dimensions: string[]
  data?: { block: number } | unknown[]
  sequence?: Sequence
}

type EpakHeader = {
  variables?: Record<string, EpakVariable>
}

type EpakBlock = {
  data: Float32Array | Float64Array | number[]
}

type Epak = {
  header: EpakHeader
  blocks: EpakBlock[]
}

type CachedGrid = {
  loadedAt: number
  validAt: string
  latitudes: Sequence
  longitudes: Sequence
  eastward: Float32Array
  northward: Float32Array
}

let cachedGrid: CachedGrid | null = null

export async function fetchNullschoolJetStream(params: URLSearchParams) {
  const points = readCoordinates(params)

  if (points.length === 0) {
    return null
  }

  const grid = await loadGrid()
  const payloads = points.map(point => {
    const vector = vectorAt(grid, point.latitude, point.longitude)
    const speed = Math.hypot(vector.eastward, vector.northward) * 3.6
    const direction = (
      Math.atan2(-vector.eastward, -vector.northward) * 180 / Math.PI + 360
    ) % 360

    return {
      latitude: point.latitude,
      longitude: point.longitude,
      current: {
        time: grid.validAt,
        wind_speed_250hPa: speed,
        wind_direction_250hPa: direction
      }
    }
  })

  return {
    body: JSON.stringify(payloads.length === 1 ? payloads[0] : payloads),
    contentType: 'application/json',
    rateLimitLimit: null,
    rateLimitRemaining: null
  }
}

async function loadGrid() {
  if (cachedGrid && Date.now() - cachedGrid.loadedAt < CACHE_AGE) {
    return cachedGrid
  }

  const response = await fetchWithTimeout(
    NULLSCHOOL_JET_STREAM_URL,
    {
      headers: {
        Accept: 'application/octet-stream',
        'User-Agent': 'Aether Weather Map https://github.com/mickyhq/aether'
      }
    },
    10000
  )

  if (!response.ok) {
    throw new Error(`Nullschool GFS error ${response.status}`)
  }

  const epak = decodeEpak(await response.arrayBuffer())
  const variables = epak.header.variables
  const eastwardVariable = variables?.U ?? variables?.u ??
    variables?.['u-component_of_wind_isobaric']
  const northwardVariable = variables?.V ?? variables?.v ??
    variables?.['v-component_of_wind_isobaric']

  if (!variables || !eastwardVariable || !northwardVariable) {
    throw new Error('Nullschool GFS wind variables unavailable')
  }

  const latitudeVariable = variables[
    eastwardVariable.dimensions.at(-2) ?? ''
  ]
  const longitudeVariable = variables[
    eastwardVariable.dimensions.at(-1) ?? ''
  ]
  const eastward = readVariableBlock(epak, eastwardVariable)
  const northward = readVariableBlock(epak, northwardVariable)

  if (!latitudeVariable?.sequence || !longitudeVariable?.sequence) {
    throw new Error('Nullschool GFS grid unavailable')
  }

  cachedGrid = {
    loadedAt: Date.now(),
    validAt: response.headers.get('x-valid-time') ?? new Date().toISOString(),
    latitudes: latitudeVariable.sequence,
    longitudes: longitudeVariable.sequence,
    eastward,
    northward
  }

  return cachedGrid
}

function vectorAt(grid: CachedGrid, latitude: number, longitude: number) {
  const row = clampIndex(
    Math.round((latitude - grid.latitudes.start) / grid.latitudes.delta),
    grid.latitudes.size
  )
  const normalizedLongitude = normalizeToGrid(
    longitude,
    grid.longitudes.start
  )
  const column = clampIndex(
    Math.round(
      (normalizedLongitude - grid.longitudes.start) /
      grid.longitudes.delta
    ),
    grid.longitudes.size
  )
  const index = row * grid.longitudes.size + column

  return {
    eastward: finiteOrZero(grid.eastward[index]),
    northward: finiteOrZero(grid.northward[index])
  }
}

function readCoordinates(params: URLSearchParams) {
  const latitudes = params.get('latitude')?.split(',') ?? []
  const longitudes = params.get('longitude')?.split(',') ?? []

  return latitudes.map((latitude, index) => ({
    latitude: Number(latitude),
    longitude: Number(longitudes[index])
  })).filter(point => (
    Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
  ))
}

function decodeEpak(buffer: ArrayBuffer): Epak {
  const view = new DataView(buffer)
  const decoder = new TextDecoder('utf-8')
  let offset = 0
  const signature = decoder.decode(new Uint8Array(buffer, offset, 4))

  offset += 4

  if (signature !== 'head') {
    throw new Error('Invalid Epak header')
  }

  const headerLength = view.getInt32(offset)

  offset += 4

  const header = JSON.parse(
    decoder.decode(new Uint8Array(buffer, offset, headerLength))
  ) as EpakHeader
  const blocks: EpakBlock[] = []

  offset += headerLength

  while (offset + 8 <= buffer.byteLength) {
    const kind = decoder.decode(new Uint8Array(buffer, offset, 4))

    offset += 4

    if (kind === 'tail') {
      break
    }

    const length = view.getInt32(offset)

    offset += 4

    if (kind === 'ppak') {
      blocks.push(decodePpak(buffer, offset, length))
    } else if (kind === 'qpak') {
      blocks.push(decodeQpak(buffer, offset, length))
    } else {
      throw new Error(`Unknown Epak block ${kind}`)
    }

    offset += length
  }

  return { header, blocks }
}

function decodePpak(buffer: ArrayBuffer, offset: number, length: number) {
  const view = new DataView(buffer, offset, length)
  const columns = view.getInt32(0)
  const rows = view.getInt32(4)
  const grids = view.getInt32(8)
  const scale = 10 ** view.getFloat32(12)
  const packed = new Uint8Array(buffer, offset + 16, length - 16)
  const data = new Float32Array(columns * rows * grids)

  unpackIntegers(packed, data)
  undeltaGrid(data, columns, rows, grids)

  for (let index = 0; index < data.length; index += 1) {
    data[index] /= scale
  }

  return { data }
}

function decodeQpak(buffer: ArrayBuffer, offset: number, length: number) {
  const view = new DataView(buffer, offset, length)
  const elementType = view.getUint8(0)
  const count = view.getInt32(1)
  const scale = view.getFloat64(5)
  const packed = new Uint8Array(buffer, offset + 13, length - 13)
  const data = elementType === 9
    ? new Float64Array(count)
    : new Float32Array(count)

  unpackIntegers(packed, data)

  let previous = 0

  for (let index = 0; index < data.length; index += 1) {
    previous += data[index]
    data[index] = previous / scale
  }

  return { data }
}

function unpackIntegers(
  packed: Uint8Array,
  output: Float32Array | Float64Array
) {
  let readIndex = 0
  let writeIndex = 0

  while (readIndex < packed.length) {
    let value = packed[readIndex]

    readIndex += 1

    if (value < 128) {
      value = value << 25 >> 25
    } else {
      const prefix = value >> 4

      if (prefix >= 8 && prefix <= 11) {
        value = value << 26 >> 18 | packed[readIndex]
        readIndex += 1
      } else if (prefix === 12 || prefix === 13) {
        value = value << 27 >> 11 |
          packed[readIndex] << 8 |
          packed[readIndex + 1]
        readIndex += 2
      } else if (prefix === 14) {
        value = value << 28 >> 4 |
          packed[readIndex] << 16 |
          packed[readIndex + 1] << 8 |
          packed[readIndex + 2]
        readIndex += 3
      } else if (value === 255) {
        const missing = 1 + packed[readIndex]

        readIndex += 1

        for (let count = 0; count < missing; count += 1) {
          output[writeIndex] = Number.NaN
          writeIndex += 1
        }
        continue
      } else if (prefix === 15) {
        value = packed[readIndex] << 24 |
          packed[readIndex + 1] << 16 |
          packed[readIndex + 2] << 8 |
          packed[readIndex + 3]
        readIndex += 4
      }
    }

    output[writeIndex] = value
    writeIndex += 1
  }

  return output
}

function undeltaGrid(
  data: Float32Array,
  columns: number,
  rows: number,
  grids: number
) {
  for (let grid = 0; grid < grids; grid += 1) {
    const start = grid * columns * rows

    for (let column = 1; column < columns; column += 1) {
      const index = start + column
      const previous = data[index - 1]

      data[index] += Number.isNaN(previous) ? 0 : previous
    }

    for (let row = 1; row < rows; row += 1) {
      const rowStart = start + row * columns
      const north = data[rowStart - columns]

      data[rowStart] += Number.isNaN(north) ? 0 : north

      for (let column = 1; column < columns; column += 1) {
        const index = rowStart + column
        const west = data[index - 1]
        const northValue = data[index - columns]
        const northwest = data[index - columns - 1]
        const combined = west + northValue - northwest

        data[index] += Number.isFinite(combined)
          ? combined
          : Number.isFinite(west)
            ? west
            : Number.isFinite(northValue)
              ? northValue
              : Number.isFinite(northwest)
                ? northwest
                : 0
      }
    }
  }
}

function readVariableBlock(epak: Epak, variable: EpakVariable) {
  const data = variable.data

  if (!data || Array.isArray(data) || !('block' in data)) {
    throw new Error('Epak variable block unavailable')
  }

  const block = epak.blocks[data.block]

  if (!block || !(block.data instanceof Float32Array)) {
    throw new Error('Epak wind block unavailable')
  }

  return block.data
}

function normalizeToGrid(longitude: number, start: number) {
  let normalized = longitude

  while (normalized < start) normalized += 360
  while (normalized >= start + 360) normalized -= 360

  return normalized
}

function clampIndex(index: number, size: number) {
  return Math.max(0, Math.min(size - 1, index))
}

function finiteOrZero(value: number | undefined) {
  return Number.isFinite(value) ? value ?? 0 : 0
}
