import type {
  AirQualityMapSample,
  AirQualityReading,
  OpenMeteoAirQualityResponse,
  WeatherLocation,
  WeatherViewport
} from '../types/weather'
import { getVisibleWeatherGrid } from './weatherGrid'
import { getWeatherCacheKey } from './weatherCache'
import { degreesToRadians, distanceInKilometers, inverseDistanceWeight } from '../utils/geo'

const AIR_QUALITY_ENDPOINT = '/api/air-quality'
const CURRENT_FIELDS = [
  'european_aqi',
  'pm2_5',
  'pm10',
  'nitrogen_dioxide',
  'ozone'
]
const FRESHNESS = 60 * 60 * 1000
const MAX_CACHE_AGE = 24 * 60 * 60 * 1000
const BATCH_SIZE = 32
const STORAGE_KEY = 'aether-air-quality-v1'
const sampleCache = new Map<string, AirQualityMapSample>()
let cacheLoaded = false

export const AIR_QUALITY_REFRESH_INTERVAL = FRESHNESS

export async function fetchAirQualityMapSamples(viewport: WeatherViewport) {
  loadCache()

  const points = getVisibleWeatherGrid(viewport)
  const refreshPoints = points.filter(point => {
    const sample = sampleCache.get(getWeatherCacheKey(point.latitude, point.longitude))

    return !sample || Date.now() - sample.updatedAt > FRESHNESS
  })
  const freshSamples: AirQualityMapSample[] = []

  for (const batch of chunkPoints(refreshPoints, BATCH_SIZE)) {
    try {
      freshSamples.push(...await fetchAirQualityBatch(batch))
    } catch {
      continue
    }
  }

  rememberSamples(freshSamples)

  return getSamplesForPoints(points)
}

export function getCachedAirQualityMapSamples(viewport: WeatherViewport) {
  loadCache()

  return getSamplesForPoints(getVisibleWeatherGrid(viewport))
}

export function interpolateAirQualityAt(
  latitude: number,
  longitude: number,
  samples: AirQualityMapSample[]
): AirQualityReading | null {
  const nearbySamples = samples
    .map(sample => ({
      sample,
      distance: distanceInKilometers(sample, { latitude, longitude })
    }))
    .sort((first, second) => first.distance - second.distance)
    .slice(0, 4)

  if (nearbySamples.length === 0) {
    return null
  }

  const totalWeight = nearbySamples.reduce(
    (sum, item) => sum + inverseDistanceWeight(item.distance),
    0
  )
  const weighted = (pick: (sample: AirQualityMapSample) => number) => (
    nearbySamples.reduce(
      (sum, item) => sum + pick(item.sample) * inverseDistanceWeight(item.distance),
      0
    ) / totalWeight
  )

  return {
    latitude,
    longitude,
    europeanAqi: weighted(sample => sample.europeanAqi),
    pm2_5: weighted(sample => sample.pm2_5),
    pm10: weighted(sample => sample.pm10),
    nitrogenDioxide: weighted(sample => sample.nitrogenDioxide),
    ozone: weighted(sample => sample.ozone)
  }
}

async function fetchAirQualityBatch(points: WeatherLocation[]) {
  if (points.length === 0) {
    return []
  }

  const params = new URLSearchParams({
    latitude: points.map(point => point.latitude.toFixed(5)).join(','),
    longitude: points.map(point => point.longitude.toFixed(5)).join(','),
    current: CURRENT_FIELDS.join(',')
  })
  const response = await fetch(`${AIR_QUALITY_ENDPOINT}?${params.toString()}`)

  if (!response.ok) {
    throw new Error(`Air quality error ${response.status}`)
  }

  const body = (await response.json()) as OpenMeteoAirQualityResponse | OpenMeteoAirQualityResponse[]
  const payloads = Array.isArray(body) ? body : [body]
  const updatedAt = Date.now()

  return payloads
    .map((payload, index) => mapAirQualitySample(points[index], payload, updatedAt))
    .filter((sample): sample is AirQualityMapSample => Boolean(sample))
}

function mapAirQualitySample(
  point: WeatherLocation | undefined,
  payload: OpenMeteoAirQualityResponse,
  updatedAt: number
): AirQualityMapSample | null {
  if (!point || !payload.current) {
    return null
  }

  const current = payload.current
  const values = [
    current.european_aqi,
    current.pm2_5,
    current.pm10,
    current.nitrogen_dioxide,
    current.ozone
  ]

  if (!values.every(Number.isFinite)) {
    return null
  }

  return {
    latitude: point.latitude,
    longitude: point.longitude,
    updatedAt,
    europeanAqi: current.european_aqi,
    pm2_5: current.pm2_5,
    pm10: current.pm10,
    nitrogenDioxide: current.nitrogen_dioxide,
    ozone: current.ozone
  }
}

function getSamplesForPoints(points: WeatherLocation[]) {
  return points
    .map(point => sampleCache.get(getWeatherCacheKey(point.latitude, point.longitude)))
    .filter((sample): sample is AirQualityMapSample => Boolean(sample))
}

function rememberSamples(samples: AirQualityMapSample[]) {
  if (samples.length === 0) {
    return
  }

  for (const sample of samples) {
    sampleCache.set(getWeatherCacheKey(sample.latitude, sample.longitude), sample)
  }

  persistCache()
}

function loadCache() {
  if (cacheLoaded) {
    return
  }

  cacheLoaded = true

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)

    if (!stored) {
      return
    }

    const now = Date.now()
    const samples = JSON.parse(stored) as AirQualityMapSample[]

    for (const sample of samples) {
      if (now - sample.updatedAt <= MAX_CACHE_AGE) {
        sampleCache.set(getWeatherCacheKey(sample.latitude, sample.longitude), sample)
      }
    }
  } catch {
    return
  }
}

function persistCache() {
  try {
    const samples = Array.from(sampleCache.values())
      .sort((first, second) => second.updatedAt - first.updatedAt)
      .slice(0, 1000)

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(samples))
  } catch {
    return
  }
}

function chunkPoints(points: WeatherLocation[], size: number) {
  const chunks: WeatherLocation[][] = []

  for (let index = 0; index < points.length; index += size) {
    chunks.push(points.slice(index, index + size))
  }

  return chunks
}
