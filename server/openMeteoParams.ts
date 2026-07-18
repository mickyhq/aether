const COORDINATE_PATTERN = /^-?\d+(?:\.\d+)?(?:,-?\d+(?:\.\d+)?)*$/
const MAX_COORDINATES = 40

export type OpenMeteoParameterConfig = {
  currentFields: Set<string>
  hourlyFields?: Set<string>
  dailyFields?: Set<string>
  timezone?: boolean
  maxForecastDays?: number
}

export const WEATHER_PARAMETER_CONFIG = {
  currentFields: new Set([
    'cloud_cover',
    'rain',
    'relative_humidity_2m',
    'showers',
    'snowfall',
    'temperature_2m',
    'weather_code',
    'pressure_msl',
    'wind_direction_250hPa',
    'wind_direction_10m',
    'wind_speed_250hPa',
    'wind_speed_10m'
  ]),
  hourlyFields: new Set([
    'cloud_cover',
    'precipitation',
    'snowfall',
    'temperature_2m',
    'weather_code',
    'pressure_msl',
    'wind_direction_10m',
    'wind_speed_10m'
  ]),
  dailyFields: new Set([
    'apparent_temperature_max',
    'sunrise',
    'sunset',
    'temperature_2m_max',
    'temperature_2m_min'
  ]),
  timezone: true,
  maxForecastDays: 7
}

export const AIR_QUALITY_PARAMETER_CONFIG = {
  currentFields: new Set([
    'european_aqi',
    'nitrogen_dioxide',
    'ozone',
    'pm10',
    'pm2_5'
  ])
}

export function buildCanonicalOpenMeteoParams(
  input: URLSearchParams,
  config: OpenMeteoParameterConfig
): { params?: URLSearchParams, error?: string } {
  const allowedParameters = new Set(['latitude', 'longitude', 'current'])

  if (config.hourlyFields) {
    allowedParameters.add('hourly')
  }

  if (config.dailyFields) {
    allowedParameters.add('daily')
  }

  if (config.maxForecastDays) {
    allowedParameters.add('forecast_days')
  }

  if (config.timezone) {
    allowedParameters.add('timezone')
  }

  for (const key of input.keys()) {
    if (!allowedParameters.has(key)) {
      return invalid(`Unknown parameter: ${key}`)
    }
  }

  for (const key of allowedParameters) {
    if (input.getAll(key).length > 1) {
      return invalid(`Duplicate parameter: ${key}`)
    }
  }

  const latitudes = parseCoordinates(input.get('latitude'), -90, 90)
  const longitudes = parseCoordinates(input.get('longitude'), -180, 180)

  if (!latitudes || !longitudes) {
    return invalid('Invalid coordinates')
  }

  if (
    latitudes.length !== longitudes.length ||
    latitudes.length > MAX_COORDINATES
  ) {
    return invalid('Coordinate batch size invalid')
  }

  const current = parseFields(input.get('current'), config.currentFields)

  if (!current) {
    return invalid('Invalid current fields')
  }

  const params = new URLSearchParams({
    latitude: latitudes.join(','),
    longitude: longitudes.join(','),
    current: current.join(',')
  })

  if (config.hourlyFields && input.has('hourly')) {
    const hourly = parseFields(input.get('hourly'), config.hourlyFields)

    if (!hourly) {
      return invalid('Invalid hourly fields')
    }

    params.set('hourly', hourly.join(','))
  }

  if (config.dailyFields && input.has('daily')) {
    const daily = parseFields(input.get('daily'), config.dailyFields)

    if (!daily) {
      return invalid('Invalid daily fields')
    }

    params.set('daily', daily.join(','))
  }

  if (config.timezone && input.has('timezone')) {
    const timezone = input.get('timezone')

    if (timezone !== 'auto') {
      return invalid('Invalid timezone')
    }

    params.set('timezone', timezone)
  }

  if (config.maxForecastDays && input.has('forecast_days')) {
    const forecastDays = Number(input.get('forecast_days'))

    if (
      !Number.isInteger(forecastDays) ||
      forecastDays < 1 ||
      forecastDays > config.maxForecastDays
    ) {
      return invalid('Invalid forecast days')
    }

    params.set('forecast_days', String(forecastDays))
  }

  return {
    params
  }
}

function parseCoordinates(
  value: string | null,
  minimum: number,
  maximum: number
) {
  if (!value || !COORDINATE_PATTERN.test(value)) {
    return null
  }

  const coordinates = value.split(',')

  if (coordinates.length === 0 || coordinates.length > MAX_COORDINATES) {
    return null
  }

  const normalized: string[] = []

  for (const coordinate of coordinates) {
    const number = Number(coordinate)

    if (!Number.isFinite(number) || number < minimum || number > maximum) {
      return null
    }

    const rounded = Math.round(number * 1000) / 1000
    const withoutNegativeZero = Object.is(rounded, -0) ? 0 : rounded

    normalized.push(withoutNegativeZero.toFixed(3))
  }

  return normalized
}

function parseFields(value: string | null, allowedFields: Set<string>) {
  if (!value) {
    return null
  }

  const fields = value.split(',')

  if (
    fields.some(field => !allowedFields.has(field)) ||
    fields.some(field => field.length === 0)
  ) {
    return null
  }

  return [...new Set(fields)].sort()
}

function invalid(error: string) {
  return {
    error
  }
}
