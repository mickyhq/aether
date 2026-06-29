import type {
  EcmwfForecast,
  OpenMeteoHourly,
  WeatherEvolutionFrame,
  WeatherLocation
} from '../types/weather'
import { clamp, degreesToRadians } from '../utils/geo'
import { THUNDERSTORM_CODES } from '../weather/weatherCode'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'

type EcmwfResponse = {
  latitude: number
  longitude: number
  model?: string
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

  const frames = hourly.time.map((time, index): WeatherEvolutionFrame => {
    const weatherCode = hourly.weather_code[index] ?? 0
    const rawWindSpeed = hourly.wind_speed_10m[index] ?? 0

    return {
      time,
      temperature: hourly.temperature_2m[index] ?? 0,
      precipitation: hourly.precipitation[index] ?? 0,
      snowfall: hourly.snowfall[index] ?? 0,
      weatherCode,
      cloudOpacity: clamp((hourly.cloud_cover[index] ?? 0) / 100, 0, 1),
      windSpeed: clamp(rawWindSpeed / 80, 0, 1),
      rawWindSpeed,
      windAngle: degreesToRadians(hourly.wind_direction_10m[index] ?? 0),
      isThunderstorm: THUNDERSTORM_CODES.has(weatherCode)
    }
  })

  return {
    model: payload.model ?? 'ECMWF IFS 9 km',
    latitude: payload.latitude,
    longitude: payload.longitude,
    frames
  }
}
