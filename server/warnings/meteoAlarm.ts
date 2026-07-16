import { fetchCoalesced } from '../coalescedFetch.js'
import {
  AETHER_USER_AGENT,
  asIsoDate,
  asText,
  asWarningGeometry,
  classifyHazard,
  geometryContainsPoint,
  isRecord,
  mergeWarningGeometries,
  normalizeCertainty,
  normalizeSeverity
} from './common.js'
import type { OfficialWarning, WarningGeometry } from './types.js'

const METEOALARM_ENDPOINT =
  'https://api.meteoalarm.org/edr/v1/collections/warnings/locations/ALL'
const LEGACY_METEOGATE_ENDPOINT =
  'https://api.meteogate.eu/warnings/collections/warnings/locations/ALL'
const QUERY_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000
const QUERY_BUCKET_MS = 5 * 60 * 1000
const MAX_CANDIDATE_FEATURES = 24
const MAX_PAGES = 8

type MeteoFeatureDetails = {
  cap: Record<string, unknown> | null
  geometry: WarningGeometry | null
}

export function hasMeteoAlarmConfiguration() {
  return Boolean(process.env.METEOALARM_TOKEN || process.env.METEOGATE_KEY)
}

export async function getMeteoAlarmWarnings(
  latitude: number,
  longitude: number
): Promise<OfficialWarning[]> {
  const token = process.env.METEOALARM_TOKEN
  const response = token
    ? await fetchMeteoAlarmFeed(token, 1)
    : await fetchLegacyMeteoGateFeed(process.env.METEOGATE_KEY ?? '')

  if (response.status === 204) {
    return []
  }

  if (!response.ok) {
    throw new Error(`MeteoAlarm warnings error ${response.status}`)
  }

  const payload = parseFeedPayload(response.body)
  const pageCount = token ? getPageCount(payload) : 1
  const additionalPages = token && pageCount > 1
    ? await Promise.all(Array.from(
        { length: pageCount - 1 },
        (_, index) => fetchMeteoAlarmFeed(token, index + 2)
      ))
    : []
  const features = [
    ...getFeatures(payload),
    ...additionalPages.flatMap(page => (
      page.ok ? getFeatures(parseFeedPayload(page.body)) : []
    ))
  ]
  const candidates = features
    .filter(feature => isCandidateFeature(feature, latitude, longitude))
    .slice(0, MAX_CANDIDATE_FEATURES)
  const mapped = await Promise.all(candidates.map(async feature => {
    const details = await fetchFeatureDetails(feature)

    return mapMeteoAlarmFeature(feature, details)
  }))

  return mapped.flatMap(warning => warning ? [warning] : [])
}

async function fetchMeteoAlarmFeed(token: string, page: number) {
  const { interval, active, bucketEnd } = buildIntervals()
  const url = new URL(METEOALARM_ENDPOINT)

  url.searchParams.set('datetime', interval)
  url.searchParams.set('active', active)
  url.searchParams.set('language', 'en')
  url.searchParams.set('page', String(page))

  return fetchCoalesced(
    `meteoalarm-warnings:${bucketEnd}:${page}`,
    url.toString(),
    AETHER_USER_AGENT,
    {
      Accept: 'application/geo+json',
      Authorization: `Bearer ${token}`
    },
    'warnings',
    15000
  )
}

async function fetchLegacyMeteoGateFeed(key: string) {
  const { interval, bucketEnd } = buildIntervals()
  const url = new URL(LEGACY_METEOGATE_ENDPOINT)

  url.searchParams.set('datetime', interval)
  url.searchParams.set('language', 'en')
  url.searchParams.set('f', 'json')

  return fetchCoalesced(
    `meteogate-warnings:${bucketEnd}`,
    url.toString(),
    AETHER_USER_AGENT,
    {
      Accept: 'application/geo+json',
      apikey: key
    },
    'warnings',
    15000
  )
}

function buildIntervals() {
  const bucketEnd = Math.floor(Date.now() / QUERY_BUCKET_MS) * QUERY_BUCKET_MS
  const start = new Date(bucketEnd - QUERY_INTERVAL_MS).toISOString()
  const end = new Date(bucketEnd).toISOString()

  return {
    bucketEnd,
    interval: `${start}/${end}`,
    active: `${end}/${end}`
  }
}

function parseFeedPayload(body: string) {
  const payload = JSON.parse(body) as unknown

  return isRecord(payload) ? payload : {}
}

function getFeatures(payload: Record<string, unknown>) {
  return Array.isArray(payload.features) ? payload.features : []
}

function getPageCount(payload: Record<string, unknown>) {
  const matched = Number(payload.numberMatched)
  const returned = Number(payload.numberReturned)

  if (!Number.isFinite(matched) || !Number.isFinite(returned) || returned < 1) {
    return 1
  }

  return Math.min(MAX_PAGES, Math.max(1, Math.ceil(matched / returned)))
}

function isCandidateFeature(
  value: unknown,
  latitude: number,
  longitude: number
) {
  if (!isRecord(value) || !isRecord(value.properties)) {
    return false
  }

  return !value.properties.supersededAt && geometryContainsPoint(
    asWarningGeometry(value.geometry),
    latitude,
    longitude
  )
}

async function fetchFeatureDetails(value: unknown): Promise<MeteoFeatureDetails> {
  if (!isRecord(value)) {
    return { cap: null, geometry: null }
  }

  const links = Array.isArray(value.links) ? value.links.filter(isRecord) : []
  const capLink = links.find(link => link.rel === 'json')
  const geometryLink = links.find(link => (
    link.rel === 'canonical' || link.type === 'application/geo+json'
  ))
  const properties = isRecord(value.properties) ? value.properties : {}
  const capUrl = asText(capLink?.href) ?? asText(properties.hubLink)
  const geometryUrl = asText(geometryLink?.href) ?? asText(properties.geometryUrl)
  const [cap, geometry] = await Promise.all([
    fetchJsonRecord(capUrl, `meteoalarm-cap:${String(properties.alertId ?? value.id)}`),
    fetchGeoJsonGeometry(
      geometryUrl,
      `meteoalarm-geometry:${String(properties.alertId ?? value.id)}`
    )
  ])

  return { cap, geometry }
}

async function fetchJsonRecord(url: string | null, key: string) {
  if (!isTrustedMeteoAlarmUrl(url)) {
    return null
  }

  try {
    const response = await fetchCoalesced(
      key,
      url,
      AETHER_USER_AGENT,
      { Accept: 'application/json' },
      'warnings'
    )

    if (!response.ok) {
      return null
    }

    const payload = JSON.parse(response.body) as unknown

    if (!isRecord(payload)) {
      return null
    }

    return isRecord(payload.alert) ? payload.alert : payload
  } catch {
    return null
  }
}

async function fetchGeoJsonGeometry(url: string | null, key: string) {
  const payload = await fetchJsonRecord(url, key)

  if (!payload) {
    return null
  }

  const direct = asWarningGeometry(payload) ?? asWarningGeometry(payload.geometry)

  if (direct) {
    return direct
  }

  if (!Array.isArray(payload.features)) {
    return null
  }

  return mergeWarningGeometries(payload.features.map(feature => (
    isRecord(feature) ? asWarningGeometry(feature.geometry) : null
  )))
}

function mapMeteoAlarmFeature(
  value: unknown,
  details: MeteoFeatureDetails
): OfficialWarning | null {
  if (!isRecord(value) || !isRecord(value.properties)) {
    return null
  }

  const properties = value.properties
  const cap = details.cap
  const info = getEnglishInfo(cap)
  const area = getFirstArea(info)
  const alertId = asText(cap?.identifier) ??
    asText(properties.alertId) ??
    asText(value.id)

  if (!alertId || cap?.status === 'Test' || cap?.msgType === 'Cancel') {
    return null
  }

  const title = asText(info?.event) ??
    asText(info?.headline) ??
    awarenessTypeTitle(properties.awareness_type) ??
    'Official weather warning'
  const sender = asText(info?.senderName) ?? asText(cap?.sender)
  const geometry = details.geometry ??
    getCapGeometry(area) ??
    asWarningGeometry(value.geometry)

  return {
    id: `meteoalarm:${alertId}`,
    provider: 'meteoalarm',
    hazard: classifyHazard(`${title} ${String(properties.awareness_type ?? '')}`),
    title,
    description: asText(info?.description) ??
      asText(info?.headline) ??
      'A MeteoAlarm member has issued a warning for this area.',
    severity: normalizeSeverity(info?.severity ?? properties.awareness_level),
    certainty: normalizeCertainty(info?.certainty ?? properties.certainty),
    effectiveAt: asIsoDate(info?.effective ?? info?.onset ?? properties.effective),
    expiresAt: asIsoDate(info?.expires ?? properties.expires),
    updatedAt: asIsoDate(cap?.sent ?? properties.sent),
    instructions: asText(info?.instruction ?? properties.instruction),
    area: asText(area?.areaDesc ?? properties.areaDesc),
    source: sender ? `${sender} via MeteoAlarm` : 'MeteoAlarm member service',
    sourceUrl: 'https://www.meteoalarm.org/',
    geometry,
    state: 'active',
    references: getCapReferences(cap?.references).map(id => `meteoalarm:${id}`)
  }
}

function getEnglishInfo(cap: Record<string, unknown> | null) {
  if (!cap) {
    return null
  }

  const blocks = Array.isArray(cap.info)
    ? cap.info.filter(isRecord)
    : isRecord(cap.info) ? [cap.info] : []

  return blocks.find(block => String(block.language ?? '').startsWith('en')) ??
    blocks[0] ??
    null
}

function getFirstArea(info: Record<string, unknown> | null) {
  if (!info) {
    return null
  }

  if (Array.isArray(info.area)) {
    return info.area.find(isRecord) ?? null
  }

  return isRecord(info.area) ? info.area : null
}

function getCapGeometry(area: Record<string, unknown> | null) {
  if (!area) {
    return null
  }

  const polygons = Array.isArray(area.polygon)
    ? area.polygon
    : area.polygon ? [area.polygon] : []
  const coordinates = polygons.flatMap(parseCapPolygon)

  return coordinates.length
    ? mergeWarningGeometries(coordinates.map(ring => ({
        type: 'Polygon',
        coordinates: [ring]
      })))
    : null
}

function parseCapPolygon(value: unknown) {
  const text = asText(value)

  if (!text) {
    return []
  }

  const ring = text.split(/\s+/).flatMap(pair => {
    const [latitude, longitude] = pair.split(',').map(Number)

    return Number.isFinite(latitude) && Number.isFinite(longitude)
      ? [[longitude, latitude]]
      : []
  })

  return ring.length >= 4 ? [ring] : []
}

function getCapReferences(value: unknown) {
  if (typeof value === 'string') {
    return value.split(/\s+/).flatMap(reference => {
      const parts = reference.split(',')

      return parts[1] ? [parts[1]] : []
    })
  }

  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap(reference => {
    if (typeof reference === 'string') {
      return [reference]
    }

    return isRecord(reference) && asText(reference.identifier)
      ? [String(reference.identifier)]
      : []
  })
}

function awarenessTypeTitle(value: unknown) {
  const text = asText(value)

  if (!text) {
    return null
  }

  return text.includes(';') ? text.split(';').slice(1).join(';').trim() : text
}

function isTrustedMeteoAlarmUrl(value: string | null): value is string {
  if (!value) {
    return false
  }

  try {
    const url = new URL(value)

    return url.protocol === 'https:' && (
      url.hostname === 'meteoalarm.org' ||
      url.hostname.endsWith('.meteoalarm.org') ||
      url.hostname === 'meteogate.eu' ||
      url.hostname.endsWith('.meteogate.eu')
    )
  } catch {
    return false
  }
}
