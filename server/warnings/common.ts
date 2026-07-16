import type {
  OfficialWarning,
  WarningCertainty,
  WarningGeometry,
  WarningHazard,
  WarningSeverity
} from './types.js'

export const AETHER_USER_AGENT =
  'Aether Weather Map (https://aether-five-rose.vercel.app)'

const HAZARD_PATTERNS: Array<[WarningHazard, RegExp]> = [
  ['fire-weather', /fire weather|red flag|wildfire|forest fire|bushfire/i],
  ['air-quality', /air quality|smoke|particulate|ozone/i],
  ['flood', /flood|inundation|storm surge|coastal event/i],
  ['snow', /snow|ice|blizzard|winter storm|avalanche|freez/i],
  ['storm', /thunderstorm|tornado|cyclone|hurricane|storm|lightning|hail/i],
  ['wind', /wind|gale/i],
  ['extreme-temperature', /heat|high temperature|cold|low temperature/i]
]

export function classifyHazard(value: string): WarningHazard {
  return HAZARD_PATTERNS.find(([, pattern]) => pattern.test(value))?.[0] ?? 'other'
}

export function normalizeSeverity(value: unknown): WarningSeverity {
  const normalized = String(value ?? '').toLowerCase()

  if (normalized.includes('extreme') || normalized.includes('red')) {
    return 'extreme'
  }

  if (normalized.includes('severe') || normalized.includes('orange')) {
    return 'severe'
  }

  if (normalized.includes('moderate') || normalized.includes('yellow')) {
    return 'moderate'
  }

  return normalized.includes('minor') ? 'minor' : 'unknown'
}

export function normalizeCertainty(value: unknown): WarningCertainty {
  const normalized = String(value ?? '').toLowerCase()

  if (normalized.includes('observed')) {
    return 'observed'
  }

  if (normalized.includes('likely')) {
    return normalized.includes('unlikely') ? 'unlikely' : 'likely'
  }

  return normalized.includes('possible') ? 'possible' : 'unknown'
}

export function asText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function asIsoDate(value: unknown) {
  const text = asText(value)

  if (!text || !Number.isFinite(Date.parse(text))) {
    return null
  }

  return new Date(text).toISOString()
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function asWarningGeometry(value: unknown): WarningGeometry | null {
  if (
    !isRecord(value) ||
    (value.type !== 'Polygon' && value.type !== 'MultiPolygon') ||
    !Array.isArray(value.coordinates)
  ) {
    return null
  }

  return {
    type: value.type,
    coordinates: value.coordinates
  }
}

export function mergeWarningGeometries(
  geometries: Array<WarningGeometry | null>
): WarningGeometry | null {
  const polygons: unknown[] = []

  for (const geometry of geometries) {
    if (geometry?.type === 'Polygon') {
      polygons.push(geometry.coordinates)
    } else if (geometry?.type === 'MultiPolygon') {
      polygons.push(...geometry.coordinates)
    }
  }

  if (polygons.length === 0) {
    return null
  }

  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0] as unknown[] }
    : { type: 'MultiPolygon', coordinates: polygons }
}

export function geometryContainsPoint(
  geometry: WarningGeometry | null,
  latitude: number,
  longitude: number
) {
  if (!geometry) {
    return false
  }

  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.coordinates

  return polygons.some(polygon => (
    Array.isArray(polygon) &&
    Array.isArray(polygon[0]) &&
    pointInRing(polygon[0], latitude, longitude)
  ))
}

export function deduplicateWarnings(warnings: OfficialWarning[]) {
  const referencedIds = new Set(warnings.flatMap(warning => warning.references))
  const current = warnings.filter(warning => !referencedIds.has(warning.id))
  const byId = new Map<string, OfficialWarning>()
  const deduplicated = new Map<string, OfficialWarning>()

  for (const warning of current.sort(sortNewestFirst)) {
    const sameId = byId.get(warning.id)

    if (sameId) {
      sameId.geometry = mergeWarningGeometries([
        sameId.geometry,
        warning.geometry
      ])
      sameId.references = [...new Set([
        ...sameId.references,
        ...warning.references
      ])]
      continue
    }

    byId.set(warning.id, warning)
  }

  for (const warning of byId.values()) {
    const key = [
      warning.provider,
      normalizeKey(warning.title),
      normalizeKey(warning.area ?? ''),
      warning.expiresAt ?? ''
    ].join(':')
    const existing = deduplicated.get(key)

    if (!existing) {
      deduplicated.set(key, warning)
      continue
    }

    existing.geometry = mergeWarningGeometries([
      existing.geometry,
      warning.geometry
    ])
    existing.references = [...new Set([
      ...existing.references,
      ...warning.references,
      warning.id
    ])]
  }

  return [...deduplicated.values()].sort((first, second) => (
    severityRank(second.severity) - severityRank(first.severity) ||
    sortNewestFirst(first, second)
  ))
}

function pointInRing(ring: unknown[], latitude: number, longitude: number) {
  let inside = false

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const currentPoint = ring[index]
    const previousPoint = ring[previous]

    if (!isCoordinate(currentPoint) || !isCoordinate(previousPoint)) {
      continue
    }

    const [currentLongitude, currentLatitude] = currentPoint
    const [previousLongitude, previousLatitude] = previousPoint
    const crosses = (currentLatitude > latitude) !== (previousLatitude > latitude) &&
      longitude < (previousLongitude - currentLongitude) *
        (latitude - currentLatitude) /
        (previousLatitude - currentLatitude) + currentLongitude

    if (crosses) {
      inside = !inside
    }
  }

  return inside
}

function isCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value) &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function sortNewestFirst(first: OfficialWarning, second: OfficialWarning) {
  return toTimestamp(second.updatedAt) - toTimestamp(first.updatedAt)
}

function toTimestamp(value: string | null) {
  return value ? Date.parse(value) || 0 : 0
}

function severityRank(severity: WarningSeverity) {
  return ['unknown', 'minor', 'moderate', 'severe', 'extreme'].indexOf(severity)
}
