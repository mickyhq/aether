import { fetchCoalesced } from './coalescedFetch.js'

export type TemperatureNormalSample = {
  latitude: number
  longitude: number
  normalTemperature: number
  yearCount: number
}

export type TemperatureNormalResponse = {
  baseline: '1991–2020'
  source: 'ERA5-Land via Open-Meteo'
  resolution: '11 km'
  targetTime: string
  samples: TemperatureNormalSample[]
}

type Coordinate = {
  latitude: number
  longitude: number
}

const ARCHIVE_ENDPOINT = 'https://archive-api.open-meteo.com/v1/archive'
const BASELINE_START_YEAR = 1991
const BASELINE_END_YEAR = 2020
const MINIMUM_VALID_YEARS = 20
const MAX_CONCURRENT_YEARS = 5
const MAX_FETCH_ATTEMPTS = 3

export async function fetchTemperatureNormals(
  coordinates: Coordinate[],
  targetTime: Date
): Promise<TemperatureNormalResponse> {
  const years = Array.from(
    { length: BASELINE_END_YEAR - BASELINE_START_YEAR + 1 },
    (_, index) => BASELINE_START_YEAR + index
  ).filter(year => isValidDate(year, targetTime))
  const results = await mapWithConcurrency(
    years,
    MAX_CONCURRENT_YEARS,
    year => fetchBaselineYear(coordinates, targetTime, year)
  )
  const totals = coordinates.map(() => ({ sum: 0, count: 0 }))

  for (const temperatures of results) {
    if (!temperatures) {
      continue
    }

    temperatures.forEach((temperature, index) => {
      if (temperature === null) {
        return
      }

      totals[index].sum += temperature
      totals[index].count += 1
    })
  }

  const samples = coordinates.flatMap((coordinate, index) => {
    const total = totals[index]

    if (total.count < MINIMUM_VALID_YEARS) {
      return []
    }

    return [{
      ...coordinate,
      normalTemperature: Math.round(total.sum / total.count * 10) / 10,
      yearCount: total.count
    }]
  })

  if (samples.length === 0) {
    throw new Error('Temperature normals unavailable')
  }

  return {
    baseline: '1991–2020',
    source: 'ERA5-Land via Open-Meteo',
    resolution: '11 km',
    targetTime: targetTime.toISOString(),
    samples
  }
}

async function fetchBaselineYear(
  coordinates: Coordinate[],
  targetTime: Date,
  year: number
): Promise<Array<number | null>> {
  const date = formatHistoricalDate(year, targetTime)
  const hour = String(targetTime.getUTCHours()).padStart(2, '0')
  const params = new URLSearchParams({
    latitude: coordinates.map(point => point.latitude.toFixed(4)).join(','),
    longitude: coordinates.map(point => point.longitude.toFixed(4)).join(','),
    start_date: date,
    end_date: date,
    hourly: 'temperature_2m',
    models: 'era5_land',
    timezone: 'GMT'
  })
  const coordinateKey = coordinates
    .map(point => `${point.latitude.toFixed(2)}:${point.longitude.toFixed(2)}`)
    .join('|')
  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt += 1) {
    const upstream = await fetchCoalesced(
      `temperature-normal:${date}:${hour}:${coordinateKey}`,
      `${ARCHIVE_ENDPOINT}?${params}`,
      'Aether Temperature Anomaly',
      {},
      'temperature-anomaly',
      15000
    )

    if (upstream.ok) {
      const payload: unknown = JSON.parse(upstream.body)
      const payloads = Array.isArray(payload) ? payload : [payload]

      return coordinates.map((_, index) => readTemperatureAtHour(
        payloads[index],
        hour
      ))
    }

    const retryable = upstream.status === 429 || upstream.status >= 500

    if (!retryable || attempt === MAX_FETCH_ATTEMPTS - 1) {
      throw new Error(`Temperature archive error ${upstream.status}`)
    }

    await delay(300 * 2 ** attempt)
  }

  throw new Error('Temperature archive unavailable')
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  task: (value: T) => Promise<R>
): Promise<Array<R | null>> {
  const results: Array<R | null> = Array(values.length).fill(null)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex

      nextIndex += 1

      try {
        results[index] = await task(values[index])
      } catch {
        results[index] = null
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => worker()
    )
  )

  return results
}

function delay(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function readTemperatureAtHour(payload: unknown, hour: string) {
  if (!isRecord(payload) || !isRecord(payload.hourly)) {
    return null
  }

  const times = payload.hourly.time
  const temperatures = payload.hourly.temperature_2m

  if (!Array.isArray(times) || !Array.isArray(temperatures)) {
    return null
  }

  const index = times.findIndex(time => (
    typeof time === 'string' && time.endsWith(`T${hour}:00`)
  ))
  const temperature = temperatures[index]

  return typeof temperature === 'number' && Number.isFinite(temperature)
    ? temperature
    : null
}

function formatHistoricalDate(year: number, targetTime: Date) {
  const month = String(targetTime.getUTCMonth() + 1).padStart(2, '0')
  const day = String(targetTime.getUTCDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function isValidDate(year: number, targetTime: Date) {
  const date = new Date(Date.UTC(
    year,
    targetTime.getUTCMonth(),
    targetTime.getUTCDate()
  ))

  return date.getUTCMonth() === targetTime.getUTCMonth() &&
    date.getUTCDate() === targetTime.getUTCDate()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
