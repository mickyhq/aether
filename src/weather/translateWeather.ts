import type { OpenMeteoResponse, WeatherConfig, WeatherLocation } from '../types/weather'
import { clamp, degreesToRadians } from '../utils/geo'

const THUNDERSTORM_CODES = new Set([95, 96, 99])

export function translateWeather(payload: OpenMeteoResponse, location: WeatherLocation): WeatherConfig {
  const current = payload.current
  const hourlyPrecip = payload.hourly?.precipitation?.[0] ?? 0
  const precipitation = Math.max(hourlyPrecip, current.rain ?? 0, current.showers ?? 0, current.snowfall ?? 0)
  const rawWindSpeed = current.wind_speed_10m
  const cloudOpacity = clamp(current.cloud_cover / 100, 0, 1)
  const windSpeed = clamp(rawWindSpeed / 80, 0, 1)

  return {
    zone: location.label || payload.timezone,
    temperature: current.temperature_2m,
    humidity: current.relative_humidity_2m,
    weatherCode: current.weather_code,
    description: describeWeather(current.weather_code),
    precipitation,
    snowfall: current.snowfall,
    windSpeed,
    rawWindSpeed,
    windAngle: degreesToRadians(current.wind_direction_10m),
    rainDensity: Math.round(clamp(precipitation, 0, 12) * 42),
    isThunderstorm: THUNDERSTORM_CODES.has(current.weather_code),
    cloudOpacity,
    evolution: buildEvolution(payload),
    heatRisk: buildHeatRisk(payload)
  }
}

function buildHeatRisk(payload: OpenMeteoResponse) {
  const daily = payload.daily

  if (!daily) {
    return null
  }

  const maximums = daily.temperature_2m_max ?? []
  const apparentMaximums = daily.apparent_temperature_max ?? []
  const hottestTemperature = Math.max(...maximums, ...apparentMaximums)

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

  return null
}

function buildEvolution(payload: OpenMeteoResponse) {
  const hourly = payload.hourly
  const count = Math.min(hourly.time.length, 36)

  return Array.from({ length: count }, (_, index) => {
    const rawWindSpeed = hourly.wind_speed_10m[index] ?? 0
    const weatherCode = hourly.weather_code[index] ?? 0

    return {
      time: hourly.time[index],
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

function describeWeather(code: number) {
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
