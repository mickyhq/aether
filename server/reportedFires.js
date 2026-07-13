import { fetchWithTimeout } from '../shared/fetchTimeout.js'

const EONET_WILDFIRES_URL = [
  'https://eonet.gsfc.nasa.gov/api/v3/events/geojson',
  '?category=wildfires&status=open&days=30&limit=500'
].join('')
const EONET_TIMEOUT_MS = 8000

export async function getReportedFires() {
  const response = await fetchWithTimeout(
    EONET_WILDFIRES_URL,
    {
      headers: {
        Accept: 'application/geo+json, application/json',
        'User-Agent': 'Aether Weather Map'
      }
    },
    EONET_TIMEOUT_MS
  )

  if (!response.ok) {
    throw new Error(`NASA EONET returned ${response.status}`)
  }

  const payload = await response.json()
  const features = Array.isArray(payload?.features) ? payload.features : []

  return deduplicateFires(features
    .map(normalizeReportedFire)
    .filter(Boolean))
}

function deduplicateFires(fires) {
  const unique = new Map()

  for (const fire of fires) {
    const locationKey = [
      fire.latitude.toFixed(3),
      fire.longitude.toFixed(3)
    ].join(':')

    if (!unique.has(locationKey)) {
      unique.set(locationKey, fire)
    }
  }

  return Array.from(unique.values())
}

function normalizeReportedFire(feature) {
  const properties = feature?.properties
  const coordinates = feature?.geometry?.coordinates
  const title = readText(properties?.title)

  if (
    feature?.geometry?.type !== 'Point' ||
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    !title ||
    isPrescribedFire(title)
  ) {
    return null
  }

  const longitude = Number(coordinates[0])
  const latitude = Number(coordinates[1])

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

  const source = Array.isArray(properties.sources)
    ? properties.sources.find(item => readUrl(item?.url))
    : null

  return {
    id: readText(properties.id) ?? `${latitude}:${longitude}:${title}`,
    title,
    description: readText(properties.description),
    latitude,
    longitude,
    reportedAt: readDate(properties.date),
    magnitude: readMagnitude(properties.magnitudeValue, properties.magnitudeUnit),
    sourceUrl: readUrl(source?.url)
  }
}

function isPrescribedFire(title) {
  return /\bprescribed\s+fire\b|\brx\b/i.test(title)
}

function readText(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 240)
    : null
}

function readDate(value) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    return null
  }

  return value
}

function readMagnitude(value, unit) {
  const amount = Number(value)
  const label = readText(unit)

  return Number.isFinite(amount) && amount >= 0 && label
    ? `${amount.toLocaleString('en-US')} ${label}`
    : null
}

function readUrl(value) {
  if (typeof value !== 'string') {
    return null
  }

  try {
    const url = new URL(value)

    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}
