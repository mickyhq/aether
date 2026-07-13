import { fetchWithTimeout } from '../shared/fetchTimeout.js'

const EONET_WILDFIRES_URL = [
  'https://eonet.gsfc.nasa.gov/api/v3/events/geojson',
  '?category=wildfires&status=open&days=30&limit=500'
].join('')
const NIFC_INCIDENTS_URL = buildUrl(
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query',
  {
    where: "IncidentTypeCategory IN ('WF','CX')",
    outFields: [
      'IrwinID',
      'UniqueFireIdentifier',
      'IncidentName',
      'IncidentShortDescription',
      'IncidentSize',
      'FireDiscoveryDateTime',
      'ModifiedOnDateTime_dt',
      'PercentContained',
      'POOState',
      'IncidentTypeCategory'
    ].join(','),
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: '2000'
  }
)
const NIFC_SOURCE_URL = 'https://www.arcgis.com/home/item.html?id=44776b299f2842479f0bad4541c81eb9'
const CWFIS_ENDPOINT = 'https://geoserver.cwfif.nrcan.gc.ca/geoserver/ows'
const CWFIS_SOURCE_URL = 'https://cwfis.cfs.nrcan.gc.ca/en/'
const PROVIDER_TIMEOUT_MS = 10000

export async function getReportedFires(hooks = {}) {
  const providers = [
    { name: 'NIFC WFIGS', load: getNifcFires },
    { name: 'NRCan CWFIS', load: getCwfisFires },
    { name: 'NASA EONET', load: getEonetFires }
  ]
  const results = await Promise.allSettled(
    providers.map(provider => provider.load(hooks, provider.name))
  )

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      hooks.onProviderFailure?.(providers[index].name, result.reason)
    }
  })
  const available = results.filter(result => result.status === 'fulfilled')

  if (available.length === 0) {
    throw new Error('All reported wildfire feeds are unavailable')
  }

  return deduplicateFires(available.flatMap(result => result.value))
}

async function getNifcFires(hooks, provider) {
  const payload = await fetchGeoJson(NIFC_INCIDENTS_URL, provider, hooks)

  return readFeatures(payload)
    .map(normalizeNifcFire)
    .filter(Boolean)
}

async function getCwfisFires(hooks, provider) {
  const now = new Date()
  const url = buildUrl(CWFIS_ENDPOINT, {
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'public:cwfif_national_activefires',
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    count: '2000',
    CQL_FILTER: [
      `record_end > '${now.toISOString()}'`,
      'fire_was_prescribed = 0',
      "stage_of_control_status <> 'EX'"
    ].join(' AND ')
  })
  const payload = await fetchGeoJson(url, provider, hooks)

  return readFeatures(payload)
    .map(normalizeCwfisFire)
    .filter(Boolean)
}

async function getEonetFires(hooks, provider) {
  const payload = await fetchGeoJson(EONET_WILDFIRES_URL, provider, hooks)

  return readFeatures(payload)
    .map(normalizeEonetFire)
    .filter(Boolean)
}

async function fetchGeoJson(url, provider, hooks) {
  hooks.onProviderRequest?.(provider)

  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        Accept: 'application/geo+json, application/json',
        'User-Agent': 'Aether Weather Map'
      }
    },
    PROVIDER_TIMEOUT_MS
  )

  hooks.onProviderResponse?.(provider, {
    status: response.status,
    rateLimitLimit: readRateLimitHeader(response.headers, 'limit'),
    rateLimitRemaining: readRateLimitHeader(response.headers, 'remaining'),
    retryAfter: response.headers.get('retry-after')
  })

  if (!response.ok) {
    throw Object.assign(
      new Error(`${provider} returned ${response.status}`),
      { status: response.status }
    )
  }

  const contentType = response.headers.get('content-type') ?? ''

  if (!contentType.includes('json')) {
    throw new Error(`${provider} returned invalid data`)
  }

  return response.json()
}

function readRateLimitHeader(headers, name) {
  return headers.get(`ratelimit-${name}`) ??
    headers.get(`x-ratelimit-${name}`)
}

function normalizeNifcFire(feature) {
  const properties = feature?.properties
  const location = readPoint(feature?.geometry)
  const title = readText(properties?.IncidentName)

  if (
    !location ||
    !title ||
    !['WF', 'CX'].includes(properties?.IncidentTypeCategory)
  ) {
    return null
  }

  const size = readPositiveNumber(properties.IncidentSize)
  const contained = readPercentage(properties.PercentContained)
  const description = [
    readText(properties.IncidentShortDescription),
    formatUsState(properties.POOState),
    contained === null ? null : `${contained}% contained`
  ].filter(Boolean).join(' · ')
  const sourceId = readText(properties.IrwinID) ??
    readText(properties.UniqueFireIdentifier)

  return {
    id: `nifc:${sourceId ?? `${location.latitude}:${location.longitude}:${title}`}`,
    title,
    description: description || null,
    ...location,
    reportedAt: readDate(
      properties.ModifiedOnDateTime_dt ?? properties.FireDiscoveryDateTime
    ),
    magnitude: size === null ? null : `${formatNumber(size)} acres`,
    source: 'NIFC WFIGS',
    sourceUrl: NIFC_SOURCE_URL
  }
}

function normalizeCwfisFire(feature) {
  const properties = feature?.properties
  const location = readCoordinateProperties(properties) ??
    readPoint(feature?.geometry)
  const sourceId = readText(properties?.national_fire_id) ??
    readText(properties?.agency_fire_id)

  if (
    !location ||
    !sourceId ||
    Number(properties?.fire_was_prescribed) === 1 ||
    properties?.stage_of_control_status === 'EX'
  ) {
    return null
  }

  const size = readPositiveNumber(properties.fire_size)
  const contained = readPercentage(properties.percent_contained)
  const description = [
    describeCanadianStatus(properties.stage_of_control_status),
    readText(properties.agency_code)
      ? `Agency ${readText(properties.agency_code)}`
      : null,
    contained === null ? null : `${contained}% contained`
  ].filter(Boolean).join(' · ')

  return {
    id: `cwfis:${sourceId}`,
    title: `Fire ${sourceId}`,
    description: description || null,
    ...location,
    reportedAt: readDate(
      properties.status_date ?? properties.situation_report_date
    ),
    magnitude: size === null ? null : `${formatNumber(size)} ha`,
    source: 'NRCan CWFIS',
    sourceUrl: CWFIS_SOURCE_URL
  }
}

function normalizeEonetFire(feature) {
  const properties = feature?.properties
  const location = readPoint(feature?.geometry)
  const title = readText(properties?.title)

  if (!location || !title || isPrescribedFire(title)) {
    return null
  }

  const source = Array.isArray(properties.sources)
    ? properties.sources.find(item => readUrl(item?.url))
    : null

  return {
    id: `eonet:${readText(properties.id) ?? `${location.latitude}:${location.longitude}:${title}`}`,
    title,
    description: readText(properties.description),
    ...location,
    reportedAt: readDate(properties.date),
    magnitude: readMagnitude(
      properties.magnitudeValue,
      properties.magnitudeUnit
    ),
    source: 'NASA EONET',
    sourceUrl: readUrl(source?.url)
  }
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

function readFeatures(payload) {
  return Array.isArray(payload?.features) ? payload.features : []
}

function readPoint(geometry) {
  const coordinates = geometry?.coordinates

  if (
    geometry?.type !== 'Point' ||
    !Array.isArray(coordinates) ||
    coordinates.length < 2
  ) {
    return null
  }

  return validateLocation(coordinates[1], coordinates[0])
}

function readCoordinateProperties(properties) {
  return validateLocation(properties?.latitude, properties?.longitude)
}

function validateLocation(latitudeValue, longitudeValue) {
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

  return { latitude, longitude }
}

function describeCanadianStatus(value) {
  return {
    OC: 'Out of control',
    BH: 'Being held',
    UC: 'Under control'
  }[value] ?? 'Active'
}

function formatUsState(value) {
  const state = readText(value)

  return state?.startsWith('US-') ? state.slice(3) : state
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
  const date = typeof value === 'number' ? new Date(value) : new Date(value)

  return !value || Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function readPositiveNumber(value) {
  const number = Number(value)

  return Number.isFinite(number) && number >= 0 ? number : null
}

function readPercentage(value) {
  const number = Number(value)

  return Number.isFinite(number) && number >= 0 && number <= 100
    ? Math.round(number)
    : null
}

function readMagnitude(value, unit) {
  const amount = readPositiveNumber(value)
  const label = readText(unit)

  return amount !== null && label
    ? `${formatNumber(amount)} ${label}`
    : null
}

function formatNumber(value) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 })
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

function buildUrl(endpoint, values) {
  const url = new URL(endpoint)

  for (const [key, value] of Object.entries(values)) {
    url.searchParams.set(key, value)
  }

  return url.toString()
}
