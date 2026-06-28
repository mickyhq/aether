import type { OpenMeteoResponse, WeatherLocation } from '../types/weather'

const OPEN_METEO_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const CURRENT_FIELDS = [
  'temperature_2m',
  'relative_humidity_2m',
  'precipitation',
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

export async function fetchOpenMeteoForecast(location: WeatherLocation): Promise<OpenMeteoResponse> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: CURRENT_FIELDS.join(','),
    hourly: HOURLY_FIELDS.join(','),
    forecast_days: '2'
  })

  const response = await fetch(`${OPEN_METEO_ENDPOINT}?${params.toString()}`)

  if (!response.ok) {
    throw new Error(`Open-Meteo error ${response.status}`)
  }

  return response.json() as Promise<OpenMeteoResponse>
}
