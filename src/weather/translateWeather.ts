import type { OpenMeteoHourly, OpenMeteoResponse, WeatherConfig, WeatherLocation } from '../types/weather'
import { clamp, degreesToRadians } from '../utils/geo'
import { mapCurrentWeather } from './mapCurrentWeather'
import { describeWeatherCode, THUNDERSTORM_CODES } from './weatherCode'

export function translateWeather(payload: OpenMeteoResponse, location: WeatherLocation): WeatherConfig {
  const current = payload.current
  const hourlyPrecip = payload.hourly?.precipitation?.[0] ?? 0
  const mapped = mapCurrentWeather(current, hourlyPrecip)

  return {
    zone: location.label || payload.timezone,
    ...mapped,
    humidity: current.relative_humidity_2m,
    description: describeWeatherCode(current.weather_code),
    rainDensity: Math.round(clamp(mapped.precipitation, 0, 12) * 42),
    evolution: buildWeatherEvolution(
      payload.hourly,
      payload.utc_offset_seconds
    ),
    sunrise: payload.daily?.sunrise?.[0] ?? null,
    sunset: payload.daily?.sunset?.[0] ?? null,
    heatRisk: buildHeatRisk(payload)
  }
}

function buildHeatRisk(payload: OpenMeteoResponse) {
  const daily = payload.daily

  if (!daily) {
    return Math.round(payload.current.temperature_2m) >= 35
      ? {
          kind: 'high-heat' as const,
          days: 1,
          maximumTemperature: payload.current.temperature_2m
        }
      : null
  }

  const maximums = daily.temperature_2m_max ?? []
  const apparentMaximums = daily.apparent_temperature_max ?? []
  const hottestTemperature = Math.max(
    payload.current.temperature_2m,
    ...maximums,
    ...apparentMaximums
  )

  if (!Number.isFinite(hottestTemperature)) {
    return null
  }

  let consecutiveHotDays = 0
  let longestHotRun = 0

  for (let index = 0; index < maximums.length; index += 1) {
    const temperature = maximums[index] ?? 0
    const apparentTemperature = apparentMaximums[index] ?? temperature

    if (temperature >= 35 || apparentTemperature >= 38) {
      consecutiveHotDays += 1
      longestHotRun = Math.max(longestHotRun, consecutiveHotDays)
    } else {
      consecutiveHotDays = 0
    }
  }

  if (longestHotRun >= 3) {
    return {
      kind: 'heat-wave' as const,
      days: longestHotRun,
      maximumTemperature: hottestTemperature
    }
  }

  if (maximums.some(value => value >= 38) || apparentMaximums.some(value => value >= 40)) {
    return {
      kind: 'extreme-heat' as const,
      days: 1,
      maximumTemperature: hottestTemperature
    }
  }

  if (
    Math.round(payload.current.temperature_2m) >= 35 ||
    maximums.some(value => value >= 35)
  ) {
    return {
      kind: 'high-heat' as const,
      days: 1,
      maximumTemperature: Math.max(
        hottestTemperature,
        payload.current.temperature_2m
      )
    }
  }

  return null
}

export function buildWeatherEvolution(
  hourly: OpenMeteoHourly,
  utcOffsetSeconds = 0,
  maximumFrames = 36
) {
  const count = Math.min(hourly.time.length, maximumFrames)

  return Array.from({ length: count }, (_, index) => {
    const rawWindSpeed = hourly.wind_speed_10m[index] ?? 0
    const weatherCode = hourly.weather_code[index] ?? 0

    return {
      time: normalizeForecastTime(hourly.time[index], utcOffsetSeconds),
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
}

function normalizeForecastTime(value: string, utcOffsetSeconds: number) {
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(value)) {
    return value
  }

  const wallClockTime = Date.parse(`${value}Z`)

  if (!Number.isFinite(wallClockTime)) {
    return value
  }

  return new Date(wallClockTime - utcOffsetSeconds * 1000).toISOString()
}
