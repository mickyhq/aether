import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import { temperatureNormalResponseSchema } from '../schemas/serverResponses'
import type {
  TemperatureAnomalySample,
  WeatherMapSample
} from '../types/weather'
import { distanceInKilometers, inverseDistanceWeight } from '../utils/geo'
import { interpolateWeatherAt } from './weatherGrid'

const MAX_NORMAL_POINTS = 12
const REQUEST_TIMEOUT_MS = 65000

export async function fetchTemperatureAnomalySamples(
  weatherSamples: WeatherMapSample[],
  signal?: AbortSignal
): Promise<TemperatureAnomalySample[]> {
  const points = distributeSamples(weatherSamples, MAX_NORMAL_POINTS)

  if (points.length === 0) {
    return []
  }

  const targetTime = new Date()
  const params = new URLSearchParams({
    latitude: points.map(point => point.latitude.toFixed(4)).join(','),
    longitude: points.map(point => point.longitude.toFixed(4)).join(','),
    time: targetTime.toISOString()
  })
  const response = await fetchWithTimeout(
    `/api/temperature-anomaly?${params}`,
    { signal },
    REQUEST_TIMEOUT_MS
  )

  if (!response.ok) {
    throw new Error(`Temperature anomaly error ${response.status}`)
  }

  const normalData = temperatureNormalResponseSchema.parse(
    await response.json(),
    'Temperature anomaly response'
  )
  const refreshedAt = Date.now()

  return normalData.samples.flatMap(normal => {
    const actual = interpolateWeatherAt(
      normal.latitude,
      normal.longitude,
      weatherSamples
    )

    if (!actual) {
      return []
    }

    return [{
      latitude: normal.latitude,
      longitude: normal.longitude,
      actualTemperature: actual.temperature,
      normalTemperature: normal.normalTemperature,
      anomaly: actual.temperature - normal.normalTemperature,
      baseline: normalData.baseline,
      source: normalData.source,
      resolution: normalData.resolution,
      observedAt: targetTime.toISOString(),
      refreshedAt
    }]
  })
}

export function interpolateTemperatureAnomalyAt(
  latitude: number,
  longitude: number,
  samples: TemperatureAnomalySample[]
) {
  const nearby = samples
    .map(sample => ({
      sample,
      distance: distanceInKilometers(sample, { latitude, longitude })
    }))
    .sort((first, second) => first.distance - second.distance)
    .slice(0, 4)

  if (nearby.length === 0) {
    return null
  }

  const totalWeight = nearby.reduce(
    (sum, item) => sum + inverseDistanceWeight(item.distance),
    0
  )
  const weighted = (pick: (sample: TemperatureAnomalySample) => number) => (
    nearby.reduce((sum, item) => (
      sum + pick(item.sample) * inverseDistanceWeight(item.distance)
    ), 0) / totalWeight
  )
  const nearest = nearby[0].sample

  return {
    normalTemperature: weighted(sample => sample.normalTemperature),
    temperatureAnomaly: weighted(sample => sample.anomaly),
    baseline: nearest.baseline
  }
}

function distributeSamples(samples: WeatherMapSample[], limit: number) {
  if (samples.length <= limit) {
    return samples
  }

  return Array.from({ length: limit }, (_, index) => (
    samples[Math.round(index * (samples.length - 1) / (limit - 1))]
  ))
}
