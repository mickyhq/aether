import { fetchCoalesced } from './coalescedFetch.js'

const MET_NORWAY_ENDPOINT =
  'https://api.met.no/weatherapi/locationforecast/2.0/compact'
const MAX_FALLBACK_POINTS = 16
const USER_AGENT = 'Aether/0.3 https://github.com/mickyhq/aether'

type MetDetails = {
  air_pressure_at_sea_level?: number
  air_temperature?: number
  cloud_area_fraction?: number
  relative_humidity?: number
  wind_from_direction?: number
  wind_speed?: number
}

type MetPeriod = {
  summary?: { symbol_code?: string }
  details?: { precipitation_amount?: number }
}

type MetTime = {
  time?: string
  data?: {
    instant?: { details?: MetDetails }
    next_1_hours?: MetPeriod
    next_6_hours?: MetPeriod
  }
}

type MetResponse = {
  properties?: {
    timeseries?: MetTime[]
  }
}

export async function fetchMetNorwayWeather(params: URLSearchParams) {
  const latitudes = params.get('latitude')?.split(',') ?? []
  const longitudes = params.get('longitude')?.split(',') ?? []
  const coordinates = latitudes
    .map((latitude, index) => ({
      latitude: Number(latitude),
      longitude: Number(longitudes[index])
    }))
    .filter(point => (
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude)
    ))
    .slice(0, MAX_FALLBACK_POINTS)

  if (coordinates.length === 0) {
    return null
  }

  const payloads = await Promise.all(coordinates.map(async point => {
    const query = new URLSearchParams({
      lat: String(point.latitude),
      lon: String(point.longitude)
    })
    const upstream = await fetchCoalesced(
      `met-norway:${point.latitude.toFixed(3)}:${point.longitude.toFixed(3)}`,
      `${MET_NORWAY_ENDPOINT}?${query}`,
      USER_AGENT,
      {},
      'weather-fallback',
      8000
    )

    if (!upstream.ok) {
      return null
    }

    return translateMetResponse(
      JSON.parse(upstream.body) as MetResponse,
      point.latitude,
      point.longitude
    )
  }))
  const available = payloads.filter(payload => payload !== null)

  if (available.length === 0) {
    return null
  }

  return {
    body: JSON.stringify(available.length === 1 ? available[0] : available),
    contentType: 'application/json',
    rateLimitLimit: null,
    rateLimitRemaining: null
  }
}

function translateMetResponse(
  payload: MetResponse,
  latitude: number,
  longitude: number
) {
  const timeseries = payload.properties?.timeseries ?? []
  const frames = timeseries
    .map(frame => translateFrame(frame))
    .filter((frame): frame is NonNullable<typeof frame> => frame !== null)
  const current = frames[0]

  if (!current) {
    return null
  }

  return {
    latitude,
    longitude,
    timezone: 'UTC',
    utc_offset_seconds: 0,
    current: {
      time: current.time,
      temperature_2m: current.temperature,
      relative_humidity_2m: current.humidity,
      rain: current.precipitation,
      showers: 0,
      snowfall: current.snowfall,
      weather_code: current.weatherCode,
      cloud_cover: current.cloudCover,
      pressure_msl: current.pressure,
      wind_speed_10m: current.windSpeed,
      wind_direction_10m: current.windDirection
    },
    hourly: {
      time: frames.map(frame => frame.time),
      temperature_2m: frames.map(frame => frame.temperature),
      precipitation: frames.map(frame => frame.precipitation),
      snowfall: frames.map(frame => frame.snowfall),
      weather_code: frames.map(frame => frame.weatherCode),
      cloud_cover: frames.map(frame => frame.cloudCover),
      pressure_msl: frames.map(frame => frame.pressure),
      wind_speed_10m: frames.map(frame => frame.windSpeed),
      wind_direction_10m: frames.map(frame => frame.windDirection)
    }
  }
}

function translateFrame(frame: MetTime) {
  const details = frame.data?.instant?.details

  if (
    !frame.time ||
    !details ||
    !isFiniteNumber(details.air_pressure_at_sea_level) ||
    !isFiniteNumber(details.air_temperature) ||
    !isFiniteNumber(details.cloud_area_fraction) ||
    !isFiniteNumber(details.wind_from_direction) ||
    !isFiniteNumber(details.wind_speed)
  ) {
    return null
  }

  const period = frame.data?.next_1_hours ?? frame.data?.next_6_hours
  const precipitation = period?.details?.precipitation_amount ?? 0
  const symbol = period?.summary?.symbol_code ?? ''
  const snowfall = /snow|sleet/.test(symbol) ? precipitation : 0

  return {
    time: frame.time,
    temperature: details.air_temperature,
    humidity: details.relative_humidity ?? 0,
    precipitation,
    snowfall,
    weatherCode: weatherCodeFromSymbol(symbol),
    cloudCover: details.cloud_area_fraction,
    pressure: details.air_pressure_at_sea_level,
    windSpeed: details.wind_speed * 3.6,
    windDirection: details.wind_from_direction
  }
}

function weatherCodeFromSymbol(symbol: string) {
  if (symbol.includes('thunder')) return 95
  if (symbol.includes('snow')) return 71
  if (symbol.includes('sleet')) return 66
  if (symbol.includes('rain')) return 61
  if (symbol.includes('fog')) return 45
  if (symbol.includes('cloudy')) return 3
  if (symbol.includes('fair')) return 1
  return 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
