import type {
  JetStreamSample,
  WeatherViewport
} from '../types/weather'
import {
  clamp,
  degreesToRadians,
  normalizeAngle,
  normalizeLongitude
} from '../utils/geo'
import {
  getJetStreamGridSize,
  observeUpstreamBudget
} from './upstreamBudget'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import { SOURCE_REFRESH_MS } from '../../shared/cachePolicy.js'
import { jetStreamResponseSchema } from '../schemas/serverResponses'
import { recordProviderFailure } from './clientTelemetry'
import { normalizeOpenMeteoTime } from '../weather/translateWeather'
import {
  getJetStreamCacheKey,
  loadPersistedJetStreamSamples,
  persistJetStreamSamples
} from './jetStreamCache'

const OPEN_METEO_ENDPOINT = '/api/weather'
const CURRENT_FIELDS = 'wind_speed_250hPa,wind_direction_250hPa'
const BATCH_SIZE = 32
const FRESHNESS = SOURCE_REFRESH_MS
const MINIMUM_LATITUDE_SPAN = 20
const MINIMUM_LONGITUDE_SPAN = 30
const sampleCache = new Map<string, JetStreamSample>()
let persistentCachePromise: Promise<void> | null = null

export const JET_STREAM_REFRESH_INTERVAL = FRESHNESS

export async function fetchJetStreamSamples(
  viewport: WeatherViewport,
  signal?: AbortSignal
) {
  await loadPersistentCache()
  signal?.throwIfAborted()

  const points = buildJetStreamGrid(viewport)
  const now = Date.now()
  const missing = points.filter(point => {
    const cached = sampleCache.get(getKey(point.latitude, point.longitude))

    return !cached || now - cached.updatedAt >= FRESHNESS
  })

  for (let index = 0; index < missing.length; index += BATCH_SIZE) {
    const gridSize = getJetStreamGridSize()
    const remainingBudget = gridSize.columns * gridSize.rows - index

    if (remainingBudget <= 0) {
      break
    }

    signal?.throwIfAborted()

    const batch = missing.slice(
      index,
      index + Math.min(BATCH_SIZE, remainingBudget)
    )
    const params = new URLSearchParams({
      latitude: batch.map(point => point.latitude.toFixed(5)).join(','),
      longitude: batch.map(point => point.longitude.toFixed(5)).join(','),
      current: CURRENT_FIELDS
    })
    const response = await fetchWithTimeout(`${OPEN_METEO_ENDPOINT}?${params}`, {
      signal
    })

    observeUpstreamBudget(response)

    if (!response.ok) {
      recordProviderFailure('jet-stream')
      continue
    }

    const body = jetStreamResponseSchema.parse(
      await response.json(),
      'Jet stream response'
    )
    const payloads = Array.isArray(body) ? body : [body]
    const updatedAt = Date.now()

    const freshSamples: JetStreamSample[] = []

    for (let payloadIndex = 0; payloadIndex < payloads.length; payloadIndex += 1) {
      const point = batch[payloadIndex]
      const current = payloads[payloadIndex]?.current
      const speed = current?.wind_speed_250hPa
      const direction = current?.wind_direction_250hPa

      if (!point || speed === undefined || direction === undefined) {
        continue
      }

      const angle = degreesToRadians(direction)
      const sample: JetStreamSample = {
        ...point,
        updatedAt,
        observedAt: normalizeOpenMeteoTime(current.time) ?? new Date(updatedAt).toISOString(),
        speed,
        angle,
        eastward: -speed * Math.sin(angle),
        northward: -speed * Math.cos(angle)
      }

      sampleCache.set(getKey(point.latitude, point.longitude), sample)
      freshSamples.push(sample)
    }

    void persistJetStreamSamples(freshSamples)
  }

  const cachedSamples = Array.from(sampleCache.values())

  return points
    .map(point => (
      sampleCache.get(getKey(point.latitude, point.longitude)) ??
      estimateCachedSample(point, cachedSamples)
    ))
    .filter((sample): sample is JetStreamSample => Boolean(sample))
}

export function interpolateJetStreamAt(
  latitude: number,
  longitude: number,
  samples: JetStreamSample[]
) {
  if (samples.length === 0) {
    return null
  }

  let eastward = 0
  let northward = 0
  let totalWeight = 0

  for (const sample of samples) {
    const distanceSquared = geographicDistanceSquared(
      latitude,
      longitude,
      sample.latitude,
      sample.longitude
    )
    const weight = 1 / (distanceSquared + 90000)

    eastward += sample.eastward * weight
    northward += sample.northward * weight
    totalWeight += weight
  }

  eastward /= totalWeight
  northward /= totalWeight

  return {
    jetStreamSpeed: Math.hypot(eastward, northward),
    jetStreamAngle: normalizeAngle(Math.atan2(-eastward, -northward))
  }
}

export function geographicDistanceSquared(
  latitude: number,
  longitude: number,
  sampleLatitude: number,
  sampleLongitude: number
) {
  const latitudeKilometers = (sampleLatitude - latitude) * 111.32
  const longitudeKilometers = (
    normalizeLongitude(sampleLongitude - longitude) *
    111.32 *
    Math.cos(degreesToRadians(latitude))
  )

  return (
    latitudeKilometers * latitudeKilometers +
    longitudeKilometers * longitudeKilometers
  )
}

function buildJetStreamGrid(viewport: WeatherViewport) {
  const { columns, rows } = getJetStreamGridSize()
  const west = viewport.west
  let east = viewport.east

  while (east <= west) {
    east += 360
  }

  const centerLongitude = west + (east - west) / 2
  const centerLatitude = (viewport.north + viewport.south) / 2
  const latitudeSpan = Math.max(
    Math.min(viewport.north, 85) - Math.max(viewport.south, -85),
    MINIMUM_LATITUDE_SPAN
  )
  const longitudeSpan = Math.min(
    360,
    Math.max(east - west, MINIMUM_LONGITUDE_SPAN)
  )
  const north = clamp(centerLatitude + latitudeSpan / 2, -85, 85)
  const south = clamp(centerLatitude - latitudeSpan / 2, -85, 85)
  const points: Array<{ latitude: number, longitude: number }> = []

  for (let row = 0; row < rows; row += 1) {
    const latitude = north + (south - north) * row / (rows - 1)

    for (let column = 0; column < columns; column += 1) {
      points.push({
        latitude,
        longitude: normalizeLongitude(
          centerLongitude - longitudeSpan / 2 +
          longitudeSpan * column / (columns - 1)
        )
      })
    }
  }

  return points
}

function getKey(latitude: number, longitude: number) {
  return getJetStreamCacheKey(latitude, longitude)
}

function estimateCachedSample(
  point: { latitude: number, longitude: number },
  cachedSamples: JetStreamSample[]
): JetStreamSample | null {
  const nearestDistance = Math.min(
    ...cachedSamples.map(sample => geographicDistanceSquared(
      point.latitude,
      point.longitude,
      sample.latitude,
      sample.longitude
    ))
  )

  if (!Number.isFinite(nearestDistance) || nearestDistance > 2500 ** 2) {
    return null
  }

  const interpolated = interpolateJetStreamAt(
    point.latitude,
    point.longitude,
    cachedSamples
  )
  const newest = cachedSamples.reduce((latest, sample) => (
    sample.updatedAt > latest.updatedAt ? sample : latest
  ))

  if (!interpolated) {
    return null
  }

  return {
    ...point,
    updatedAt: newest.updatedAt,
    observedAt: newest.observedAt,
    speed: interpolated.jetStreamSpeed,
    angle: interpolated.jetStreamAngle,
    eastward: -interpolated.jetStreamSpeed * Math.sin(
      interpolated.jetStreamAngle
    ),
    northward: -interpolated.jetStreamSpeed * Math.cos(
      interpolated.jetStreamAngle
    )
  }
}

async function loadPersistentCache() {
  persistentCachePromise ??= loadPersistedJetStreamSamples().then(samples => {
    for (const sample of samples) {
      sampleCache.set(getKey(sample.latitude, sample.longitude), sample)
    }
  })

  await persistentCachePromise
}
