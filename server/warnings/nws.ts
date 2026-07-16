import { fetchCoalesced } from '../coalescedFetch.js'
import {
  AETHER_USER_AGENT,
  asIsoDate,
  asText,
  asWarningGeometry,
  classifyHazard,
  isRecord,
  mergeWarningGeometries,
  normalizeCertainty,
  normalizeSeverity
} from './common.js'
import type { OfficialWarning, WarningGeometry } from './types.js'

const NWS_ALERTS_ENDPOINT = 'https://api.weather.gov/alerts/active'
const NWS_ALERTS_ACCEPT = 'application/geo+json'
const MAX_ZONE_GEOMETRIES = 48

export async function getNwsWarnings(
  latitude: number,
  longitude: number
): Promise<OfficialWarning[]> {
  const point = `${latitude.toFixed(3)},${longitude.toFixed(3)}`
  const url = new URL(NWS_ALERTS_ENDPOINT)

  url.searchParams.set('point', point)
  url.searchParams.set('status', 'actual')

  const response = await fetchCoalesced(
    `nws-warnings:${point}`,
    url.toString(),
    AETHER_USER_AGENT,
    { Accept: NWS_ALERTS_ACCEPT },
    'warnings'
  )

  if (response.status === 400) {
    return []
  }

  if (!response.ok) {
    throw new Error(`NWS alerts error ${response.status}`)
  }

  const payload = JSON.parse(response.body) as unknown
  const features = isRecord(payload) && Array.isArray(payload.features)
    ? payload.features
    : []
  const zoneUrls = [...new Set(features.flatMap(getAffectedZoneUrls))]
    .slice(0, MAX_ZONE_GEOMETRIES)
  const zoneGeometries = await fetchZoneGeometries(zoneUrls)

  return features.flatMap(feature => {
    const warning = mapNwsFeature(feature, zoneGeometries)

    return warning ? [warning] : []
  })
}

function mapNwsFeature(
  value: unknown,
  zoneGeometries: Map<string, WarningGeometry>
): OfficialWarning | null {
  if (!isRecord(value) || !isRecord(value.properties)) {
    return null
  }

  const properties = value.properties
  const title = asText(properties.event) ?? 'Official weather warning'
  const id = asText(value.id) ?? asText(properties.id)

  if (!id || properties.status === 'Test' || properties.messageType === 'Cancel') {
    return null
  }

  const affectedZones = getAffectedZoneUrls(value)
  const geometry = asWarningGeometry(value.geometry) ?? mergeWarningGeometries(
    affectedZones.map(zone => zoneGeometries.get(zone) ?? null)
  )

  return {
    id,
    provider: 'nws',
    hazard: classifyHazard(`${title} ${String(properties.category ?? '')}`),
    title,
    description: asText(properties.description) ??
      asText(properties.headline) ??
      'An official warning is active for this area.',
    severity: normalizeSeverity(properties.severity),
    certainty: normalizeCertainty(properties.certainty),
    effectiveAt: asIsoDate(properties.effective ?? properties.onset),
    expiresAt: asIsoDate(properties.expires ?? properties.ends),
    updatedAt: asIsoDate(properties.sent),
    instructions: asText(properties.instruction),
    area: asText(properties.areaDesc),
    source: asText(properties.senderName) ?? 'US National Weather Service',
    sourceUrl: id.startsWith('https://') ? id : null,
    geometry,
    state: 'active',
    references: getReferenceIds(properties.references)
  }
}

async function fetchZoneGeometries(urls: string[]) {
  const entries = await Promise.all(urls.map(async url => {
    try {
      const response = await fetchCoalesced(
        `nws-zone:${url}`,
        url,
        AETHER_USER_AGENT,
        { Accept: NWS_ALERTS_ACCEPT },
        'warnings'
      )

      if (!response.ok) {
        return null
      }

      const payload = JSON.parse(response.body) as unknown
      const geometry = isRecord(payload)
        ? asWarningGeometry(payload.geometry)
        : null

      return geometry ? [url, geometry] as const : null
    } catch {
      return null
    }
  }))

  return new Map(entries.filter(
    (entry): entry is readonly [string, WarningGeometry] => Boolean(entry)
  ))
}

function getAffectedZoneUrls(value: unknown) {
  if (!isRecord(value) || !isRecord(value.properties)) {
    return []
  }

  return Array.isArray(value.properties.affectedZones)
    ? value.properties.affectedZones.filter((zone): zone is string => (
        typeof zone === 'string' && zone.startsWith('https://api.weather.gov/zones/')
      ))
    : []
}

function getReferenceIds(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap(reference => {
    if (!isRecord(reference)) {
      return []
    }

    const id = asText(reference['@id']) ?? asText(reference.identifier)

    return id ? [id] : []
  })
}
