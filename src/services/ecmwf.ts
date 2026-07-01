import type {
  EcmwfForecast,
  OpenMeteoHourly,
  WeatherLocation
} from '../types/weather'
import { buildWeatherEvolution } from '../weather/translateWeather'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'

type EcmwfResponse = {
  latitude: number
  longitude: number
  model?: string
  utc_offset_seconds?: number
  hourly: OpenMeteoHourly
}

export async function fetchEcmwfLocationForecast(
  location: WeatherLocation,
  signal?: AbortSignal
): Promise<EcmwfForecast> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    forecast_hours: '120'
  })
  const response = await fetchWithTimeout(`/api/ecmwf?${params}`, { signal })

  if (!response.ok) {
    throw new Error(`ECMWF forecast error ${response.status}`)
  }

  const payload = await response.json() as EcmwfResponse
  const hourly = payload.hourly

  if (!hourly?.time?.length) {
    throw new Error('ECMWF forecast is empty')
  }

  const frames = buildWeatherEvolution(
    hourly,
    payload.utc_offset_seconds,
    hourly.time.length
  )

  return {
    model: payload.model ?? 'ECMWF IFS 9 km',
    latitude: payload.latitude,
    longitude: payload.longitude,
    frames
  }
}
