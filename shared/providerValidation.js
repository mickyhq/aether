const WEATHER_CURRENT_FIELDS = [
  'temperature_2m',
  'weather_code',
  'cloud_cover',
  'wind_speed_10m',
  'wind_direction_10m'
]

const WEATHER_HOURLY_FIELDS = [
  'time',
  'precipitation'
]

const AIR_QUALITY_FIELDS = [
  'european_aqi',
  'pm2_5',
  'pm10',
  'nitrogen_dioxide',
  'ozone'
]

export function isWeatherResponse(value) {
  const payloads = Array.isArray(value) ? value : [value]

  return payloads.length > 0 && payloads.every(payload => (
    isRecord(payload) &&
    isRecord(payload.current) &&
    WEATHER_CURRENT_FIELDS.every(field => Number.isFinite(payload.current[field])) &&
    optionalFiniteNumber(payload.current.pressure_msl) &&
    isRecord(payload.hourly) &&
    WEATHER_HOURLY_FIELDS.every(field => Array.isArray(payload.hourly[field])) &&
    optionalArray(payload.hourly.pressure_msl)
  ))
}

export function isJetStreamResponse(value) {
  const payloads = Array.isArray(value) ? value : [value]

  return payloads.length > 0 && payloads.every(payload => (
    isRecord(payload) &&
    isRecord(payload.current) &&
    Number.isFinite(payload.current.wind_speed_250hPa) &&
    Number.isFinite(payload.current.wind_direction_250hPa)
  ))
}

export function isAirQualityResponse(value) {
  const payloads = Array.isArray(value) ? value : [value]

  return payloads.length > 0 && payloads.every(payload => (
    isRecord(payload) &&
    isRecord(payload.current) &&
    AIR_QUALITY_FIELDS.every(field => Number.isFinite(payload.current[field]))
  ))
}

export function parseProviderBody(body, validate) {
  try {
    const value = JSON.parse(body)

    return validate(value) ? value : null
  } catch {
    return null
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function optionalFiniteNumber(value) {
  return value === undefined || Number.isFinite(value)
}

function optionalArray(value) {
  return value === undefined || Array.isArray(value)
}
