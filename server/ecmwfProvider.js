import { fetchCoalesced } from './coalescedFetch.js'

const OPEN_METEO_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const OPEN_METEO_CUSTOMER_ENDPOINT = 'https://customer-api.open-meteo.com/v1/forecast'
const ECMWF_MODEL = 'ECMWF IFS 9 km'
const FALLBACK_MODEL = 'Standard forecast'
const HOURLY_FIELDS = [
  'temperature_2m',
  'precipitation',
  'snowfall',
  'weather_code',
  'cloud_cover',
  'wind_speed_10m',
  'wind_direction_10m'
]

export async function fetchEcmwfForecast(
  latitude,
  longitude,
  forecastHours = 120
) {
  const baseParams = {
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: HOURLY_FIELDS.join(','),
    forecast_hours: String(forecastHours),
    timezone: 'auto'
  }
  const attempts = buildAttempts(latitude, longitude, forecastHours, baseParams)
  const errors = []

  for (const attempt of attempts) {
    const upstream = await fetchCoalesced(
      attempt.key,
      attempt.url,
      'Aether ECMWF Forecast',
      {},
      'ecmwf'
    )

    if (!upstream.ok) {
      errors.push(`${attempt.model} ${upstream.status}`)
      continue
    }

    const payload = JSON.parse(upstream.body)

    if (!isEcmwfForecast(payload)) {
      errors.push(`${attempt.model} invalid`)
      continue
    }

    return {
      ...payload,
      model: attempt.model
    }
  }

  throw new Error(`ECMWF provider unavailable: ${errors.join(', ')}`)
}

function buildAttempts(latitude, longitude, forecastHours, baseParams) {
  const coordinateKey = `${latitude.toFixed(3)}:${longitude.toFixed(3)}:${forecastHours}`
  const attempts = []
  const key = process.env.ECMWF_KEY?.trim()

  if (key) {
    const params = new URLSearchParams({
      ...baseParams,
      models: 'ecmwf_ifs',
      apikey: key
    })

    attempts.push({
      key: `ecmwf:customer:${coordinateKey}`,
      model: ECMWF_MODEL,
      url: `${OPEN_METEO_CUSTOMER_ENDPOINT}?${params}`
    })
  }

  const ecmwfParams = new URLSearchParams({
    ...baseParams,
    models: 'ecmwf_ifs'
  })

  attempts.push({
    key: `ecmwf:free:${coordinateKey}`,
    model: ECMWF_MODEL,
    url: `${OPEN_METEO_ENDPOINT}?${ecmwfParams}`
  })

  const fallbackParams = new URLSearchParams(baseParams)

  attempts.push({
    key: `ecmwf:fallback:${coordinateKey}`,
    model: FALLBACK_MODEL,
    url: `${OPEN_METEO_ENDPOINT}?${fallbackParams}`
  })

  return attempts
}

function isEcmwfForecast(payload) {
  const hourly = payload?.hourly
  const length = hourly?.time?.length

  return (
    Number.isInteger(length) &&
    length > 0 &&
    HOURLY_FIELDS.every(field => (
      Array.isArray(hourly[field]) &&
      hourly[field].length === length
    ))
  )
}
