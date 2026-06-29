import {
  WEATHER_FRESH_CACHE_TTL,
  STALE_CACHE_TTL
} from '../server/cachePolicy.js'
import {
  WEATHER_PARAMETER_CONFIG,
  buildCanonicalOpenMeteoParams
} from '../server/openMeteoParams.js'
import { getCacheNamespace } from '../shared/cacheVersion.js'
import {
  getSharedCache,
  readSharedCache,
  writeSharedCache
} from '../server/sharedCache.js'

const OPEN_METEO_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const CURRENT_FIELDS = [
  'temperature_2m',
  'relative_humidity_2m',
  'rain',
  'showers',
  'snowfall',
  'weather_code',
  'cloud_cover',
  'wind_speed_10m',
  'wind_direction_10m'
]
const HOURLY_FIELDS = [
  'temperature_2m',
  'precipitation',
  'snowfall',
  'weather_code',
  'cloud_cover',
  'wind_speed_10m',
  'wind_direction_10m'
]
const DAILY_FIELDS = [
  'temperature_2m_max',
  'temperature_2m_min',
  'apparent_temperature_max',
  'sunrise',
  'sunset'
]
const POPULAR_LOCATIONS = [
  { name: 'Ajaccio', latitude: 41.9192, longitude: 8.7386 },
  { name: 'Paris', latitude: 48.8566, longitude: 2.3522 },
  { name: 'Marseille', latitude: 43.2965, longitude: 5.3698 },
  { name: 'Los Angeles', latitude: 34.0522, longitude: -118.2437 },
  { name: 'New York City', latitude: 40.7128, longitude: -74.006 },
  { name: 'Tokyo', latitude: 35.6762, longitude: 139.6503 },
  { name: 'Osaka', latitude: 34.6937, longitude: 135.5023 }
]

if (process.env.VERCEL_ENV !== 'production') {
  console.log('Weather cache warm skipped outside Vercel production')
} else {
  await warmWeatherCache()
}

async function warmWeatherCache() {
  const cache = getSharedCache(getCacheNamespace('weather'))

  if (!cache) {
    console.log('Weather cache warm skipped: Runtime Cache unavailable')
    return
  }

  let warmed = 0
  let alreadyFresh = 0

  for (const location of POPULAR_LOCATIONS) {
    const params = getLocationParams(location)
    const cacheKey = params.toString()
    const cached = await readSharedCache(cache, `fresh:${cacheKey}`)

    if (cached) {
      alreadyFresh += 1
      continue
    }

    try {
      const response = await fetch(`${OPEN_METEO_ENDPOINT}?${cacheKey}`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Aether Deployment Cache Warmer'
        }
      })

      if (response.status === 429) {
        console.log('Weather cache warm stopped: provider rate limited')
        break
      }

      if (!response.ok) {
        console.log(`Weather cache warm failed for ${location.name}: ${response.status}`)
        continue
      }

      const record = {
        body: await response.text(),
        contentType: response.headers.get('content-type') ?? 'application/json'
      }
      const writes = await Promise.all([
        writeSharedCache(
          cache,
          `fresh:${cacheKey}`,
          record,
          WEATHER_FRESH_CACHE_TTL
        ),
        writeSharedCache(
          cache,
          `stale:${cacheKey}`,
          record,
          STALE_CACHE_TTL
        )
      ])

      if (writes.every(Boolean)) {
        warmed += 1
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'

      console.log(`Weather cache warm failed for ${location.name}: ${message}`)
    }
  }

  console.log(
    `Weather cache warm complete: ${warmed} added, ${alreadyFresh} already fresh`
  )
}

function getLocationParams(location) {
  const input = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: CURRENT_FIELDS.join(','),
    hourly: HOURLY_FIELDS.join(','),
    daily: DAILY_FIELDS.join(','),
    forecast_days: '7',
    timezone: 'auto'
  })
  const canonical = buildCanonicalOpenMeteoParams(
    input,
    WEATHER_PARAMETER_CONFIG
  )

  if (!canonical.params) {
    throw new Error(canonical.error)
  }

  return canonical.params
}
