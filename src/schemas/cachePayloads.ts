import type {
  AirQualityMapSample,
  WeatherEvolutionFrame,
  WeatherMapSample
} from '../types/weather'

export function isWeatherMapSample(value: unknown): value is WeatherMapSample {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.label === 'string' &&
    isFiniteNumber(value.latitude) &&
    isFiniteNumber(value.longitude) &&
    optional(value.updatedAt, isFiniteNumber) &&
    optional(value.observedAt, isTimestamp) &&
    optional(value.showBadge, isBoolean) &&
    optional(value.estimated, isBoolean) &&
    optional(value.evolution, item => (
      Array.isArray(item) && item.every(isWeatherEvolutionFrame)
    )) &&
    optional(value.sunrise, item => item === null || isTimestamp(item)) &&
    optional(value.sunset, item => item === null || isTimestamp(item)) &&
    isFiniteNumber(value.temperature) &&
    isFiniteNumber(value.precipitation) &&
    isFiniteNumber(value.snowfall) &&
    isFiniteNumber(value.weatherCode) &&
    isFiniteNumber(value.windSpeed) &&
    isFiniteNumber(value.rawWindSpeed) &&
    isFiniteNumber(value.windAngle) &&
    isFiniteNumber(value.cloudOpacity) &&
    isBoolean(value.isThunderstorm)
  )
}

export function isAirQualityMapSample(
  value: unknown
): value is AirQualityMapSample {
  return isRecord(value) &&
    isFiniteNumber(value.latitude) &&
    isFiniteNumber(value.longitude) &&
    isFiniteNumber(value.updatedAt) &&
    isTimestamp(value.observedAt) &&
    isFiniteNumber(value.europeanAqi) &&
    isFiniteNumber(value.pm2_5) &&
    isFiniteNumber(value.pm10) &&
    isFiniteNumber(value.nitrogenDioxide) &&
    isFiniteNumber(value.ozone)
}

function isWeatherEvolutionFrame(
  value: unknown
): value is WeatherEvolutionFrame {
  return isRecord(value) &&
    isTimestamp(value.time) &&
    isFiniteNumber(value.temperature) &&
    isFiniteNumber(value.precipitation) &&
    isFiniteNumber(value.snowfall) &&
    isFiniteNumber(value.weatherCode) &&
    isFiniteNumber(value.cloudOpacity) &&
    isFiniteNumber(value.windSpeed) &&
    isFiniteNumber(value.rawWindSpeed) &&
    isFiniteNumber(value.windAngle) &&
    isBoolean(value.isThunderstorm)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isTimestamp(value: unknown): value is string {
  return isString(value) && /[zZ]$|[+-]\d{2}:\d{2}$/.test(value)
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function optional(
  value: unknown,
  validate: (item: unknown) => boolean
) {
  return value === undefined || validate(value)
}
