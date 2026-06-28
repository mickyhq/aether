import type {
  MapWeatherPointer,
  OpenMeteoResponse,
  WeatherConfig,
  WeatherLocation,
  WeatherMapSample,
  WeatherViewport
} from '../types/weather'
import { getWeatherCacheKey, loadPersistedWeatherSamples, persistWeatherSamples } from './weatherCache'
import { clamp, degreesToRadians, distanceInKilometers, inverseDistanceWeight, normalizeAngle, normalizeLongitude, radiansToDegrees } from '../utils/geo'

type GridPoint = WeatherLocation & {
  showBadge: false
}

const OPEN_METEO_ENDPOINT = '/api/weather'
const CURRENT_FIELDS = [
  'temperature_2m',
  'rain',
  'showers',
  'snowfall',
  'weather_code',
  'cloud_cover',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_speed_250hPa',
  'wind_direction_250hPa'
]

const HOURLY_FIELDS = [
  'precipitation'
]
const THUNDERSTORM_CODES = new Set([95, 96, 99])
const FRESHNESS = 5 * 60 * 1000
const BATCH_SIZE = 32
const MAX_GRID_POINTS = 48
const BATCH_DELAY_MS = 250
const BASE_SPACING = 260
const sampleCache = new Map<string, WeatherMapSample>()
let persistentCachePromise: Promise<void> | null = null
let lastBatchFetchTime = 0

export const WEATHER_REFRESH_INTERVAL = FRESHNESS

export function getVisibleWeatherGrid(viewport: WeatherViewport): WeatherLocation[] {
  return buildVisibleGrid(viewport).map(point => ({
    label: point.label,
    latitude: point.latitude,
    longitude: point.longitude
  }))
}

export async function fetchWeatherMapSamples(
  viewport: WeatherViewport,
  signal?: AbortSignal
) {
  signal?.throwIfAborted()
  await loadPersistentCache()
  signal?.throwIfAborted()

  const points = buildVisibleGrid(viewport)
  const refreshPoints = points.filter(point => {
    const sample = sampleCache.get(getWeatherCacheKey(point.latitude, point.longitude))

    return needsRefresh(sample)
  })
  const freshSamples: WeatherMapSample[] = []

  for (const batch of chunkPoints(refreshPoints, BATCH_SIZE)) {
    signal?.throwIfAborted()
    await throttleBatchDelay()
    signal?.throwIfAborted()

    try {
      freshSamples.push(...await fetchWeatherBatch(batch, signal))
    } catch (error) {
      if (signal?.aborted) {
        throw error
      }

      continue
    }
  }

  rememberSamples(freshSamples)
  void persistWeatherSamples(freshSamples)

  return getSamplesForGrid(points)
}

export async function hydrateWeatherMapCache(viewport: WeatherViewport) {
  await loadPersistentCache()

  return getCachedWeatherMapSamples(viewport)
}

export function getCachedWeatherMapSamples(viewport: WeatherViewport) {
  return getSamplesForGrid(buildVisibleGrid(viewport))
}

export function cacheWeatherSample(location: WeatherLocation, weather: WeatherConfig) {
  const sample: WeatherMapSample = {
    label: location.label,
    latitude: location.latitude,
    longitude: location.longitude,
    updatedAt: Date.now(),
    showBadge: true,
    evolution: weather.evolution,
    temperature: weather.temperature,
    precipitation: weather.precipitation,
    snowfall: weather.snowfall,
    weatherCode: weather.weatherCode,
    windSpeed: weather.windSpeed,
    rawWindSpeed: weather.rawWindSpeed,
    windAngle: weather.windAngle,
    cloudOpacity: weather.cloudOpacity,
    isThunderstorm: weather.isThunderstorm
  }

  rememberSamples([sample])
  void persistWeatherSamples([sample])
}

export async function getCachedWeatherForLocation(location: WeatherLocation): Promise<WeatherConfig | null> {
  await loadPersistentCache()

  const nearbySample = Array.from(sampleCache.values())
    .map(sample => ({
      sample,
      distance: distanceInKilometers(sample, location)
    }))
    .filter(item => item.distance <= 50)
    .sort((first, second) => first.distance - second.distance)[0]?.sample

  if (!nearbySample) {
    return null
  }

  return {
    zone: location.label,
    temperature: nearbySample.temperature,
    humidity: 0,
    weatherCode: nearbySample.weatherCode,
    description: describeWeatherCode(nearbySample.weatherCode),
    precipitation: nearbySample.precipitation,
    snowfall: nearbySample.snowfall,
    windSpeed: nearbySample.windSpeed,
    rawWindSpeed: nearbySample.rawWindSpeed,
    windAngle: nearbySample.windAngle,
    rainDensity: Math.round(clamp(nearbySample.precipitation, 0, 12) * 42),
    isThunderstorm: nearbySample.isThunderstorm,
    cloudOpacity: nearbySample.cloudOpacity,
    evolution: nearbySample.evolution ?? [],
    heatRisk: null
  }
}

export function interpolateWeatherAt(
  latitude: number,
  longitude: number,
  samples: WeatherMapSample[]
): Omit<MapWeatherPointer, 'screenX' | 'screenY'> | null {
  const nearbySamples = samples
    .map(sample => ({
      sample,
      distance: distanceInKilometers(sample, { latitude, longitude })
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6)

  if (nearbySamples.length === 0) {
    return null
  }

  const totalWeight = nearbySamples.reduce((sum, item) => sum + inverseDistanceWeight(item.distance), 0)
  const weighted = (pick: (sample: WeatherMapSample) => number) => (
    nearbySamples.reduce(
      (sum, item) => sum + pick(item.sample) * inverseDistanceWeight(item.distance),
      0
    ) / totalWeight
  )
  const eastwardWind = weighted(sample => -sample.rawWindSpeed * Math.sin(sample.windAngle))
  const northwardWind = weighted(sample => -sample.rawWindSpeed * Math.cos(sample.windAngle))
  const jetStream = interpolateJetStream(nearbySamples)
  const nearest = nearbySamples[0].sample

  return {
    latitude,
    longitude,
    temperature: weighted(sample => sample.temperature),
    precipitation: weighted(sample => sample.precipitation),
    rawWindSpeed: Math.hypot(eastwardWind, northwardWind),
    windAngle: normalizeAngle(Math.atan2(-eastwardWind, -northwardWind)),
    ...jetStream,
    cloudOpacity: weighted(sample => sample.cloudOpacity),
    isThunderstorm: nearest.isThunderstorm
  }
}

async function fetchWeatherBatch(
  points: GridPoint[],
  signal?: AbortSignal
): Promise<WeatherMapSample[]> {
  if (points.length === 0) {
    return []
  }

  const params = new URLSearchParams({
    latitude: points.map(point => point.latitude.toFixed(5)).join(','),
    longitude: points.map(point => point.longitude.toFixed(5)).join(','),
    current: CURRENT_FIELDS.join(','),
    hourly: HOURLY_FIELDS.join(','),
    forecast_days: '1'
  })
  const response = await fetch(`${OPEN_METEO_ENDPOINT}?${params.toString()}`, {
    signal
  })

  if (!response.ok) {
    throw new Error(`Weather grid error ${response.status}`)
  }

  const body = (await response.json()) as OpenMeteoResponse | OpenMeteoResponse[]
  const payloads = Array.isArray(body) ? body : [body]
  const updatedAt = Date.now()

  return payloads
    .map((payload, index) => mapWeatherSample(points[index], payload, updatedAt))
    .filter((sample): sample is WeatherMapSample => Boolean(sample))
}

function mapWeatherSample(point: GridPoint | undefined, payload: OpenMeteoResponse, updatedAt: number): WeatherMapSample | null {
  if (!point) {
    return null
  }

  const current = payload.current
  const hourlyPrecip = payload.hourly?.precipitation?.[0] ?? 0
  const precipitation = Math.max(hourlyPrecip, current.rain ?? 0, current.showers ?? 0, current.snowfall ?? 0)
  const rawWindSpeed = current.wind_speed_10m

  return {
    label: point.label,
    latitude: point.latitude,
    longitude: point.longitude,
    updatedAt,
    showBadge: false,
    temperature: current.temperature_2m,
    precipitation,
    snowfall: current.snowfall,
    weatherCode: current.weather_code,
    windSpeed: clamp(rawWindSpeed / 80, 0, 1),
    rawWindSpeed,
    windAngle: degreesToRadians(current.wind_direction_10m),
    jetStreamSpeed: current.wind_speed_250hPa,
    jetStreamAngle: current.wind_direction_250hPa === undefined
      ? undefined
      : degreesToRadians(current.wind_direction_250hPa),
    cloudOpacity: clamp(current.cloud_cover / 100, 0, 1),
    isThunderstorm: THUNDERSTORM_CODES.has(current.weather_code)
  }
}

function buildVisibleGrid(viewport: WeatherViewport): GridPoint[] {
  const sampleZoom = clamp(Math.floor(viewport.zoom), 2, 14)
  const worldSize = 256 * 2 ** sampleZoom
  const spacing = getGridSpacing(viewport)
  const west = viewport.west
  let east = viewport.east

  while (east <= west) {
    east += 360
  }

  east = Math.min(east, west + 360)

  const westX = longitudeToWorldX(west, worldSize)
  const eastX = longitudeToWorldX(east, worldSize)
  const northY = latitudeToWorldY(clamp(viewport.north, -85, 85), worldSize)
  const southY = latitudeToWorldY(clamp(viewport.south, -85, 85), worldSize)
  const firstColumn = Math.floor(westX / spacing) - 1
  const lastColumn = Math.ceil(eastX / spacing) + 1
  const firstRow = Math.floor(northY / spacing) - 1
  const lastRow = Math.ceil(southY / spacing) + 1
  const points = new Map<string, GridPoint>()

  for (let row = firstRow; row <= lastRow; row += 1) {
    const latitude = worldYToLatitude(row * spacing, worldSize)

    if (latitude < -85 || latitude > 85) {
      continue
    }

    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const longitude = normalizeLongitude(worldXToLongitude(column * spacing, worldSize))
      const key = getWeatherCacheKey(latitude, longitude)

      points.set(key, {
        label: `grid-${sampleZoom}-${column}-${row}`,
        latitude,
        longitude,
        showBadge: false
      })
    }
  }

  return distributePoints(Array.from(points.values()), MAX_GRID_POINTS)
}

function getGridSpacing(viewport: WeatherViewport) {
  const estimatedColumns = Math.ceil(viewport.width / BASE_SPACING) + 3
  const estimatedRows = Math.ceil(viewport.height / BASE_SPACING) + 3
  const estimatedPoints = estimatedColumns * estimatedRows
  const scale = estimatedPoints > MAX_GRID_POINTS
    ? Math.sqrt(estimatedPoints / MAX_GRID_POINTS)
    : 1

  return Math.ceil(BASE_SPACING * scale / 16) * 16
}

function getSamplesForGrid(points: GridPoint[]) {
  return points
    .map(point => {
      const exactSample = sampleCache.get(getWeatherCacheKey(point.latitude, point.longitude))

      if (exactSample) {
        return {
          ...exactSample,
          label: point.label,
          latitude: point.latitude,
          longitude: point.longitude,
          showBadge: false
        }
      }

      return estimateSample(point)
    })
    .filter((sample): sample is WeatherMapSample => Boolean(sample))
}

function estimateSample(point: GridPoint): WeatherMapSample | null {
  const nearbySamples = Array.from(sampleCache.values())
    .map(sample => ({
      sample,
      distance: distanceInKilometers(sample, point)
    }))
    .filter(item => item.distance <= 350)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6)

  if (nearbySamples.length < 3) {
    return null
  }

  const totalWeight = nearbySamples.reduce((sum, item) => sum + inverseDistanceWeight(item.distance), 0)
  const weighted = (pick: (sample: WeatherMapSample) => number) => (
    nearbySamples.reduce(
      (sum, item) => sum + pick(item.sample) * inverseDistanceWeight(item.distance),
      0
    ) / totalWeight
  )
  const eastwardWind = weighted(sample => -sample.rawWindSpeed * Math.sin(sample.windAngle))
  const northwardWind = weighted(sample => -sample.rawWindSpeed * Math.cos(sample.windAngle))
  const rawWindSpeed = Math.hypot(eastwardWind, northwardWind)
  const windAngle = normalizeAngle(Math.atan2(-eastwardWind, -northwardWind))
  const jetStream = interpolateJetStream(nearbySamples)
  const nearest = nearbySamples[0].sample

  return {
    label: point.label,
    latitude: point.latitude,
    longitude: point.longitude,
    showBadge: false,
    estimated: true,
    temperature: weighted(sample => sample.temperature),
    precipitation: weighted(sample => sample.precipitation),
    snowfall: weighted(sample => sample.snowfall),
    weatherCode: nearest.weatherCode,
    windSpeed: clamp(rawWindSpeed / 80, 0, 1),
    rawWindSpeed,
    windAngle,
    ...jetStream,
    cloudOpacity: weighted(sample => sample.cloudOpacity),
    isThunderstorm: nearest.isThunderstorm
  }
}

function rememberSamples(samples: WeatherMapSample[]) {
  for (const sample of samples) {
    sampleCache.set(getWeatherCacheKey(sample.latitude, sample.longitude), sample)
  }
}

function loadPersistentCache() {
  if (!persistentCachePromise) {
    persistentCachePromise = loadPersistedWeatherSamples().then(rememberSamples)
  }

  return persistentCachePromise
}

function needsRefresh(sample: WeatherMapSample | undefined) {
  return (
    !sample?.updatedAt ||
    sample.jetStreamSpeed === undefined ||
    sample.jetStreamAngle === undefined ||
    Date.now() - sample.updatedAt >= FRESHNESS
  )
}

function interpolateJetStream(
  nearbySamples: Array<{ sample: WeatherMapSample, distance: number }>
) {
  const available = nearbySamples.filter(({ sample }) => (
    sample.jetStreamSpeed !== undefined &&
    sample.jetStreamAngle !== undefined
  ))

  if (available.length === 0) {
    return {}
  }

  const totalWeight = available.reduce(
    (sum, item) => sum + inverseDistanceWeight(item.distance),
    0
  )
  const eastward = available.reduce((sum, item) => {
    const speed = item.sample.jetStreamSpeed ?? 0
    const angle = item.sample.jetStreamAngle ?? 0

    return sum - speed * Math.sin(angle) * inverseDistanceWeight(item.distance)
  }, 0) / totalWeight
  const northward = available.reduce((sum, item) => {
    const speed = item.sample.jetStreamSpeed ?? 0
    const angle = item.sample.jetStreamAngle ?? 0

    return sum - speed * Math.cos(angle) * inverseDistanceWeight(item.distance)
  }, 0) / totalWeight

  return {
    jetStreamSpeed: Math.hypot(eastward, northward),
    jetStreamAngle: normalizeAngle(Math.atan2(-eastward, -northward))
  }
}

function chunkPoints(points: GridPoint[], size: number) {
  const chunks: GridPoint[][] = []

  for (let index = 0; index < points.length; index += size) {
    chunks.push(points.slice(index, index + size))
  }

  return chunks
}

function distributePoints(points: GridPoint[], limit: number) {
  if (points.length <= limit) {
    return points
  }

  return Array.from({ length: limit }, (_, index) => {
    const pointIndex = Math.round(index * (points.length - 1) / (limit - 1))

    return points[pointIndex]
  })
}

function longitudeToWorldX(longitude: number, worldSize: number) {
  return ((longitude + 180) / 360) * worldSize
}

function worldXToLongitude(x: number, worldSize: number) {
  return x / worldSize * 360 - 180
}

function latitudeToWorldY(latitude: number, worldSize: number) {
  const radians = degreesToRadians(latitude)
  const mercator = Math.log(Math.tan(Math.PI / 4 + radians / 2))

  return (1 - mercator / Math.PI) / 2 * worldSize
}

function worldYToLatitude(y: number, worldSize: number) {
  const mercator = Math.PI * (1 - 2 * y / worldSize)

  return radiansToDegrees(Math.atan(Math.sinh(mercator)))
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

function describeWeatherCode(code: number) {
  if (THUNDERSTORM_CODES.has(code)) {
    return 'Thunderstorm'
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return 'Snow'
  }

  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return 'Rain'
  }

  if ([45, 48].includes(code)) {
    return 'Fog'
  }

  if ([1, 2, 3].includes(code)) {
    return 'Cloud drift'
  }

  return 'Clear air'
}
