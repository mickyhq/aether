import type { OpenMeteoCurrent } from '../types/weather'
import { clamp, degreesToRadians } from '../utils/geo'
import { THUNDERSTORM_CODES } from './weatherCode'

export function mapCurrentWeather(
  current: OpenMeteoCurrent,
  hourlyPrecipitation = 0
) {
  const precipitation = Math.max(
    hourlyPrecipitation,
    current.rain ?? 0,
    current.showers ?? 0,
    current.snowfall ?? 0
  )
  const rawWindSpeed = current.wind_speed_10m

  return {
    temperature: current.temperature_2m,
    precipitation,
    pressureMsl: current.pressure_msl,
    snowfall: current.snowfall,
    weatherCode: current.weather_code,
    windSpeed: clamp(rawWindSpeed / 80, 0, 1),
    rawWindSpeed,
    windAngle: degreesToRadians(current.wind_direction_10m),
    cloudOpacity: clamp(current.cloud_cover / 100, 0, 1),
    isThunderstorm: THUNDERSTORM_CODES.has(current.weather_code)
  }
}
