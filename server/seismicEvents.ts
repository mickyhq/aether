import { fetchCoalesced } from './coalescedFetch.js'

type EarthquakeEvent = {
  id: string
  magnitude: number
  place: string
  occurredAt: string
  updatedAt: string
  latitude: number
  longitude: number
  depthKm: number
  tsunamiProduct: boolean
  alert: 'green' | 'yellow' | 'orange' | 'red' | null
  status: string
  source: string
  sourceUrl: string
}

type TsunamiWarning = {
  id: string
  level: 'warning' | 'advisory' | 'watch' | 'threat'
  title: string
  description: string
  instructions: string | null
  sentAt: string
  expiresAt: string | null
  latitude: number
  longitude: number
  magnitude: number | null
  location: string
  source: string
  sourceUrl: string
  state: 'active' | 'grace'
}

export type SeismicEventsRecord = {
  generatedAt: string
  earthquakes: EarthquakeEvent[]
  tsunamiWarnings: TsunamiWarning[]
}

const USGS_FEED =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'
const TSUNAMI_CAP_FEEDS = [
  {
    id: 'ntwc',
    source: 'NOAA National Tsunami Warning Center',
    url: 'https://www.tsunami.gov/events/xml/PAAQCAP.xml'
  },
  {
    id: 'ptwc',
    source: 'NOAA Pacific Tsunami Warning Center',
    url: 'https://www.tsunami.gov/events/xml/PHEBCAP.xml'
  }
] as const
const USER_AGENT = 'Aether Weather Map (https://aether-five-rose.vercel.app)'
const TSUNAMI_WITHOUT_EXPIRY_MS = 6 * 60 * 60 * 1000

export const SEISMIC_FRESH_MS = 60 * 1000
export const TSUNAMI_GRACE_MS = 15 * 60 * 1000

export async function getSeismicEvents(): Promise<SeismicEventsRecord> {
  const [earthquakeResponse, ...tsunamiResponses] = await Promise.all([
    fetchCoalesced(
      'seismic:usgs-day-2.5',
      USGS_FEED,
      USER_AGENT,
      { Accept: 'application/geo+json' },
      'seismic-events'
    ),
    ...TSUNAMI_CAP_FEEDS.map(feed => fetchCoalesced(
      `seismic:${feed.id}-cap`,
      feed.url,
      USER_AGENT,
      { Accept: 'application/cap+xml, application/xml' },
      'seismic-events'
    ))
  ])

  if (!earthquakeResponse.ok) {
    throw new Error(`USGS earthquake feed error ${earthquakeResponse.status}`)
  }

  for (const response of tsunamiResponses) {
    if (!response.ok) {
      throw new Error(`NOAA tsunami feed error ${response.status}`)
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    earthquakes: parseEarthquakes(earthquakeResponse.body),
    tsunamiWarnings: tsunamiResponses.flatMap((response, index) => {
      const warning = parseTsunamiCap(
        response.body,
        TSUNAMI_CAP_FEEDS[index].source
      )

      return warning ? [warning] : []
    })
  }
}

export function prepareSeismicEvents(
  record: SeismicEventsRecord,
  cacheState: 'live' | 'grace',
  now = Date.now()
) {
  const generatedAt = Date.parse(record.generatedAt)

  if (
    cacheState === 'grace' &&
    (
      !Number.isFinite(generatedAt) ||
      now - generatedAt > SEISMIC_FRESH_MS + TSUNAMI_GRACE_MS
    )
  ) {
    return null
  }

  return {
    ...record,
    cacheState,
    gracePeriodMinutes: TSUNAMI_GRACE_MS / 60_000,
    tsunamiWarnings: record.tsunamiWarnings.flatMap(warning => {
      const sentAt = Date.parse(warning.sentAt)
      const expiresAt = warning.expiresAt
        ? Date.parse(warning.expiresAt)
        : sentAt + TSUNAMI_WITHOUT_EXPIRY_MS
      const expiredAge = now - expiresAt

      if (!Number.isFinite(expiresAt) || expiredAge > TSUNAMI_GRACE_MS) {
        return []
      }

      return [{
        ...warning,
        state: cacheState === 'grace' || expiredAge > 0
          ? 'grace' as const
          : 'active' as const
      }]
    })
  }
}

function parseEarthquakes(body: string): EarthquakeEvent[] {
  const payload = JSON.parse(body) as unknown

  if (!isRecord(payload) || !Array.isArray(payload.features)) {
    throw new Error('USGS earthquake feed has invalid data')
  }

  return payload.features.flatMap(value => {
    if (
      !isRecord(value) ||
      !isRecord(value.properties) ||
      !isRecord(value.geometry) ||
      value.geometry.type !== 'Point' ||
      !Array.isArray(value.geometry.coordinates)
    ) {
      return []
    }

    const properties = value.properties
    const [longitude, latitude, depthKm] = value.geometry.coordinates
    const id = text(value.id)
    const magnitude = finiteNumber(properties.mag)
    const occurredAt = epochDate(properties.time)
    const updatedAt = epochDate(properties.updated)
    const sourceUrl = safeHttpsUrl(properties.url, 'earthquake.usgs.gov')

    if (
      !id ||
      magnitude === null ||
      !occurredAt ||
      !updatedAt ||
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      typeof depthKm !== 'number' ||
      !sourceUrl ||
      properties.type !== 'earthquake'
    ) {
      return []
    }

    return [{
      id,
      magnitude,
      place: text(properties.place) ?? 'Unknown location',
      occurredAt,
      updatedAt,
      latitude,
      longitude,
      depthKm,
      tsunamiProduct: properties.tsunami === 1,
      alert: earthquakeAlert(properties.alert),
      status: text(properties.status) ?? 'unknown',
      source: 'USGS Earthquake Hazards Program',
      sourceUrl
    }]
  })
}

function parseTsunamiCap(body: string, source: string): TsunamiWarning | null {
  const status = readTag(body, 'status')
  const messageType = readTag(body, 'msgType')
  const event = readTag(body, 'event') ?? ''
  const headline = readTag(body, 'headline') ?? ''
  const combinedTitle = `${event} ${headline}`.trim()
  const level = tsunamiLevel(combinedTitle)
  const description = readTag(body, 'description') ??
    'An official tsunami alert is active.'
  const instruction = readTag(body, 'instruction')
  const fullMessage = `${combinedTitle} ${description} ${instruction ?? ''}`

  if (
    status !== 'Actual' ||
    messageType === 'Cancel' ||
    /information|no tsunami (warning|advisory|watch|threat)/i.test(combinedTitle) ||
    /\bfinal\b|threat (?:has )?(?:now )?(?:largely )?passed|no tsunami (?:danger|threat)|does not pose a tsunami threat/i.test(fullMessage) ||
    !level
  ) {
    return null
  }

  const identifier = readTag(body, 'identifier')
  const sentAt = isoDate(readTag(body, 'sent'))
  const parameters = readParameters(body)
  const coordinates = parseCoordinates(
    parameters.get('EventLatLon') ?? readTag(body, 'circle')
  )

  if (!identifier || !sentAt || !coordinates) {
    throw new Error('NOAA tsunami CAP feed has invalid active warning data')
  }

  const web = upgradeTsunamiUrl(readTag(body, 'web'))

  return {
    id: identifier,
    level,
    title: headline || event || `Tsunami ${level}`,
    description,
    instructions: nullableInstruction(instruction),
    sentAt,
    expiresAt: isoDate(readTag(body, 'expires')),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    magnitude: finiteNumber(parameters.get('EventPreliminaryMagnitude')),
    location: parameters.get('EventLocationName') ??
      readTag(body, 'areaDesc') ??
      'Tsunami event',
    source,
    sourceUrl: web ?? 'https://www.tsunami.gov/',
    state: 'active'
  }
}

function readTag(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))

  return match ? cleanXmlText(match[1]) : null
}

function readParameters(xml: string) {
  const parameters = new Map<string, string>()
  const blocks = xml.match(/<parameter(?:\s[^>]*)?>[\s\S]*?<\/parameter>/gi) ?? []

  for (const block of blocks) {
    const name = readTag(block, 'valueName')
    const value = readTag(block, 'value')

    if (name && value) {
      parameters.set(name, value)
    }
  }

  return parameters
}

function cleanXmlText(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseCoordinates(value: string | null) {
  if (!value) {
    return null
  }

  const [latitude, longitude] = value.split(/[ ,]+/).map(Number)

  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null
}

function tsunamiLevel(value: string): TsunamiWarning['level'] | null {
  if (/tsunami warning/i.test(value)) return 'warning'
  if (/tsunami advisory/i.test(value)) return 'advisory'
  if (/tsunami watch/i.test(value)) return 'watch'
  if (/tsunami threat/i.test(value)) return 'threat'

  return null
}

function nullableInstruction(value: string | null) {
  return value && !/^N\/?A$/i.test(value) ? value : null
}

function earthquakeAlert(value: unknown): EarthquakeEvent['alert'] {
  return value === 'green' ||
    value === 'yellow' ||
    value === 'orange' ||
    value === 'red'
    ? value
    : null
}

function epochDate(value: unknown) {
  const timestamp = finiteNumber(value)

  return timestamp === null ? null : new Date(timestamp).toISOString()
}

function isoDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) {
    return null
  }

  return new Date(value).toISOString()
}

function finiteNumber(value: unknown) {
  const number = typeof value === 'string' ? Number(value) : value

  return typeof number === 'number' && Number.isFinite(number) ? number : null
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function safeHttpsUrl(value: unknown, hostname: string) {
  const raw = text(value)

  if (!raw) {
    return null
  }

  try {
    const url = new URL(raw)

    return url.protocol === 'https:' && url.hostname === hostname
      ? url.toString()
      : null
  } catch {
    return null
  }
}

function upgradeTsunamiUrl(value: string | null) {
  if (!value) {
    return null
  }

  try {
    const url = new URL(value)

    if (url.hostname !== 'www.tsunami.gov') {
      return null
    }

    url.protocol = 'https:'
    return url.toString()
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
