import { fetchCoalesced } from './coalescedFetch.js'

const NWS_ALERTS_ENDPOINT = 'https://api.weather.gov/alerts/active'
const HEAT_EVENT_PATTERN = /heat/i

export function parseHeatAlertCoordinates(latitudeValue, longitudeValue) {
  const latitude = Number(latitudeValue)
  const longitude = Number(longitudeValue)

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null
  }

  return {
    latitude: normalizeCoordinate(latitude),
    longitude: normalizeCoordinate(longitude)
  }
}

export async function getOfficialHeatAlerts(latitude, longitude) {
  if (!isLikelyUnitedStates(latitude, longitude)) {
    return []
  }

  const point = `${latitude.toFixed(3)},${longitude.toFixed(3)}`
  const url = new URL(NWS_ALERTS_ENDPOINT)

  url.searchParams.set('point', point)
  url.searchParams.set('status', 'actual')

  const response = await fetchCoalesced(
    `nws-heat:${point}`,
    url.toString(),
    'Aether Weather Map (https://aether-weather.vercel.app)'
  )

  if (!response.ok) {
    throw new Error(`NWS alerts error ${response.status}`)
  }

  const payload = JSON.parse(response.body)
  const features = Array.isArray(payload.features) ? payload.features : []

  return features
    .map(feature => feature?.properties)
    .filter(properties => (
      properties &&
      typeof properties.event === 'string' &&
      HEAT_EVENT_PATTERN.test(properties.event)
    ))
    .map(properties => ({
      id: String(properties.id ?? properties['@id'] ?? properties.event),
      title: properties.event,
      message: getAlertMessage(properties),
      severity: getAlertSeverity(properties),
      source: 'US National Weather Service'
    }))
}

function getAlertMessage(properties) {
  const headline = typeof properties.headline === 'string'
    ? properties.headline.trim()
    : ''

  if (headline) {
    return headline
  }

  return 'Official heat warning is active. Follow local safety guidance.'
}

function getAlertSeverity(properties) {
  return properties.severity === 'Extreme' || /excessive/i.test(properties.event)
    ? 'error'
    : 'warning'
}

function isLikelyUnitedStates(latitude, longitude) {
  return (
    latitude >= 18 &&
    latitude <= 72 &&
    longitude >= -180 &&
    longitude <= -60
  )
}

function normalizeCoordinate(value) {
  const rounded = Math.round(value * 1000) / 1000

  return Object.is(rounded, -0) ? 0 : rounded
}
