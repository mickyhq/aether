const COORDINATE_PATTERN = /^-?\d+(?:\.\d+)?(?:,-?\d+(?:\.\d+)?)*$/
const MAX_COORDINATES = 40

export const WEATHER_PARAMETER_CONFIG = {
  currentFields: new Set([
    'cloud_cover',
    'rain',
    'relative_humidity_2m',
    'showers',
    'snowfall',
    'temperature_2m',
    'weather_code',
    'wind_direction_10m',
    'wind_speed_10m'
  ]),
  hourlyFields: new Set([
    'cloud_cover',
    'precipitation',
    'snowfall',
    'temperature_2m',
    'weather_code',
    'wind_direction_10m',
    'wind_speed_10m'
  ]),
  maxForecastDays: 2
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

export function buildCanonicalOpenMeteoParams(input, config) {
  const allowedParameters = new Set(['latitude', 'longitude', 'current'])

  if (config.hourlyFields) {
    allowedParameters.add('hourly')
  }

  if (config.maxForecastDays) {
    allowedParameters.add('forecast_days')
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

function parseCoordinates(value, minimum, maximum) {
  if (!value || !COORDINATE_PATTERN.test(value)) {
    return null
  }

  const coordinates = value.split(',')

  if (coordinates.length === 0 || coordinates.length > MAX_COORDINATES) {
    return null
  }

  const normalized = []

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

function parseFields(value, allowedFields) {
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

function invalid(error) {
  return {
    error
  }
}
