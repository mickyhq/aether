import type {
  AirQualityMapSample,
  AirQualityReading,
  OpenMeteoAirQualityResponse,
  WeatherLocation,
  WeatherViewport
} from '../types/weather'
import { getVisibleWeatherGrid } from './weatherGrid'
import { getWeatherCacheKey } from './weatherCache'
import { getMapSampleLimit, observeUpstreamBudget } from './upstreamBudget'
import { openStorage } from './storage'
import { distanceInKilometers, inverseDistanceWeight } from '../utils/geo'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import { SOURCE_REFRESH_MS } from '../../shared/cachePolicy.js'
import { airQualityResponseSchema } from '../schemas/serverResponses'

const AIR_QUALITY_ENDPOINT = '/api/air-quality'
const CURRENT_FIELDS = [
  'european_aqi',
  'pm2_5',
  'pm10',
  'nitrogen_dioxide',
  'ozone'
]
const FRESHNESS = SOURCE_REFRESH_MS
const MAX_CACHE_AGE = 24 * 60 * 60 * 1000
const BATCH_SIZE = 32
const BATCH_DELAY_MS = 250
const STORE_NAME = 'air-quality-samples'
const MAX_STORED_SAMPLES = 1000
const sampleCache = new Map<string, AirQualityMapSample>()
let persistTimer = 0
let cacheLoaded = false
let lastBatchFetchTime = 0

export const AIR_QUALITY_REFRESH_INTERVAL = FRESHNESS

export async function fetchAirQualityMapSamples(viewport: WeatherViewport) {
  await loadCache()

  const points = getVisibleWeatherGrid(viewport)
  const refreshPoints = points.filter(point => {
    const sample = sampleCache.get(getWeatherCacheKey(point.latitude, point.longitude))

    return !sample || Date.now() - sample.updatedAt > FRESHNESS
  })
  const freshSamples: AirQualityMapSample[] = []

  for (let index = 0; index < refreshPoints.length;) {
    const remainingBudget = getMapSampleLimit() - index

    if (remainingBudget <= 0) {
      break
    }

    const batch = refreshPoints.slice(
      index,
      index + Math.min(BATCH_SIZE, remainingBudget)
    )
    index += batch.length
    await throttleBatchDelay()

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
  void loadCache()

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
  const response = await fetchWithTimeout(
    `${AIR_QUALITY_ENDPOINT}?${params.toString()}`
  )

  observeUpstreamBudget(response)

  if (!response.ok) {
    throw new Error(`Air quality error ${response.status}`)
  }

  const body = airQualityResponseSchema.parse(
    await response.json(),
    'Air quality response'
  )
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
    const key = getWeatherCacheKey(sample.latitude, sample.longitude)

    sampleCache.delete(key)
    sampleCache.set(key, sample)
  }

  while (sampleCache.size > MAX_STORED_SAMPLES) {
    const oldestKey = sampleCache.keys().next().value

    if (typeof oldestKey !== 'string') {
      break
    }

    sampleCache.delete(oldestKey)
  }

  schedulePersist()
}

async function loadCache() {
  if (cacheLoaded) {
    return
  }

  cacheLoaded = true

  try {
    const database = await openStorage()

    if (!database) {
      return
    }

    const records = await new Promise<AirQualityMapSample[]>(resolve => {
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const request = transaction.objectStore(STORE_NAME).getAll()

      request.onsuccess = () => resolve(request.result as AirQualityMapSample[])
      request.onerror = () => resolve([])
    })

    const now = Date.now()

    for (const sample of records) {
      if (now - sample.updatedAt <= MAX_CACHE_AGE) {
        sampleCache.set(getWeatherCacheKey(sample.latitude, sample.longitude), sample)
      }
    }
  } catch {
    return
  }
}

function schedulePersist() {
  window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    void persistCache()
  }, 800)
}

async function persistCache() {
  try {
    const database = await openStorage()

    if (!database) {
      return
    }

    const samples = Array.from(sampleCache.values())
      .sort((first, second) => second.updatedAt - first.updatedAt)
      .slice(0, MAX_STORED_SAMPLES)

    await new Promise<void>(resolve => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      store.clear()

      for (const sample of samples) {
        store.put({
          key: getWeatherCacheKey(sample.latitude, sample.longitude),
          ...sample
        })
      }

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
      transaction.onabort = () => resolve()
    })
  } catch {
    return
  }
}

async function throttleBatchDelay() {
  const elapsed = Date.now() - lastBatchFetchTime

  if (elapsed < BATCH_DELAY_MS) {
    await new Promise(resolve => {
      window.setTimeout(resolve, BATCH_DELAY_MS - elapsed)
    })
  }

  lastBatchFetchTime = Date.now()
}
