import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import type {
  OceanCurrentReading,
  OceanCurrentSample,
  WeatherViewport
} from '../types/weather'
import { degreesToRadians, normalizeAngle, normalizeLongitude } from '../utils/geo'
import {
  oceanCurrentResponseSchema,
  parseResponseJson
} from '../schemas/serverResponses'

const ENDPOINT = '/api/ocean-currents'
const VIEWPORT_PADDING = 0.12

export const OCEAN_CURRENT_REFRESH_INTERVAL = 6 * 60 * 60 * 1000

export async function fetchOceanCurrentData(
  viewport: WeatherViewport,
  signal?: AbortSignal
) {
  const bounds = expandViewport(viewport)
  const params = new URLSearchParams({
    north: bounds.north.toFixed(3),
    south: bounds.south.toFixed(3),
    east: bounds.east.toFixed(3),
    west: bounds.west.toFixed(3),
    width: String(Math.round(viewport.width)),
    height: String(Math.round(viewport.height))
  })
  const response = await fetchWithTimeout(`${ENDPOINT}?${params}`, { signal }, 20000)

  if (!response.ok) {
    throw new Error('Ocean currents unavailable')
  }

  const data = await parseResponseJson(
    response,
    oceanCurrentResponseSchema,
    'Ocean current response'
  )

  return data
}

export function interpolateOceanCurrentAt(
  latitude: number,
  longitude: number,
  samples: OceanCurrentSample[]
): OceanCurrentReading | null {
  if (samples.length === 0) {
    return null
  }

  const closestGridPoint = samples
    .map(sample => ({
      sample,
      distance: geographicDistanceSquared(latitude, longitude, sample)
    }))
    .sort((a, b) => a.distance - b.distance)
    [0]

  if (!closestGridPoint?.sample.ocean) {
    return null
  }

  const nearest = samples
    .filter(sample => sample.ocean)
    .map(sample => ({
      sample,
      distance: geographicDistanceSquared(latitude, longitude, sample)
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 4)

  if (nearest.length === 0) {
    return null
  }

  const closestDistance = Math.sqrt(nearest[0].distance)

  if (closestDistance > 250) {
    return null
  }

  let eastward = 0
  let northward = 0
  let temperature = 0
  let anomaly = 0
  let totalWeight = 0

  for (const item of nearest) {
    const weight = 1 / (item.distance + 16)

    eastward += item.sample.eastward * weight
    northward += item.sample.northward * weight
    temperature += item.sample.temperature * weight
    anomaly += item.sample.anomaly * weight
    totalWeight += weight
  }

  eastward /= totalWeight
  northward /= totalWeight

  return {
    oceanCurrentSpeed: Math.hypot(eastward, northward),
    oceanCurrentAngle: normalizeAngle(Math.atan2(eastward, northward)),
    seaSurfaceTemperature: temperature / totalWeight,
    seaSurfaceTemperatureAnomaly: anomaly / totalWeight
  }
}

function expandViewport(viewport: WeatherViewport) {
  const latitudePadding = (viewport.north - viewport.south) * VIEWPORT_PADDING
  const longitudePadding = (viewport.east - viewport.west) * VIEWPORT_PADDING

  return {
    north: clamp(viewport.north + latitudePadding, -85, 85),
    south: clamp(viewport.south - latitudePadding, -85, 85),
    east: clamp(viewport.east + longitudePadding, -179.875, 179.875),
    west: clamp(viewport.west - longitudePadding, -179.875, 179.875)
  }
}

function geographicDistanceSquared(
  latitude: number,
  longitude: number,
  sample: OceanCurrentSample
) {
  const latitudeKilometers = (sample.latitude - latitude) * 111.32
  const longitudeKilometers = (
    normalizeLongitude(sample.longitude - longitude) *
    111.32 *
    Math.cos(degreesToRadians(latitude))
  )

  return (
    latitudeKilometers * latitudeKilometers +
    longitudeKilometers * longitudeKilometers
  )
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}
