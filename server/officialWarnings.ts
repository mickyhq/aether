import { deduplicateWarnings } from './warnings/common.js'
import {
  getMeteoAlarmWarnings,
  hasMeteoAlarmConfiguration
} from './warnings/meteoAlarm.js'
import { getNwsWarnings } from './warnings/nws.js'
import type {
  OfficialWarning,
  OfficialWarningsRecord,
  WarningProviderStatus
} from './warnings/types.js'

export const OFFICIAL_WARNING_GRACE_MS = 15 * 60 * 1000
export const OFFICIAL_WARNING_FRESH_MS = 5 * 60 * 1000

export function parseWarningCoordinates(
  latitudeValue: unknown,
  longitudeValue: unknown
): { latitude: number, longitude: number } | null {
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

export async function getOfficialWarnings(
  latitude: number,
  longitude: number
): Promise<OfficialWarningsRecord> {
  let warnings: OfficialWarning[] = []
  const providers: WarningProviderStatus[] = []

  if (isLikelyUnitedStates(latitude, longitude)) {
    warnings = await getNwsWarnings(latitude, longitude)
    providers.push({
      id: 'nws',
      source: 'US National Weather Service',
      status: 'available'
    })
  } else {
    providers.push({
      id: 'nws',
      source: 'US National Weather Service',
      status: 'not-applicable'
    })
  }

  if (isLikelyEurope(latitude, longitude)) {
    if (hasMeteoAlarmConfiguration()) {
      warnings = [
        ...warnings,
        ...await getMeteoAlarmWarnings(latitude, longitude)
      ]
      providers.push({
        id: 'meteoalarm',
        source: 'MeteoAlarm member services',
        status: 'available'
      })
    } else {
      providers.push({
        id: 'meteoalarm',
        source: 'MeteoAlarm member services',
        status: 'unconfigured'
      })
    }
  } else {
    providers.push({
      id: 'meteoalarm',
      source: 'MeteoAlarm member services',
      status: 'not-applicable'
    })
  }

  return {
    generatedAt: new Date().toISOString(),
    warnings: deduplicateWarnings(warnings),
    providers
  }
}

export function prepareWarningsForResponse(
  record: OfficialWarningsRecord,
  cacheState: 'live' | 'grace',
  now = Date.now()
) {
  const generatedAt = Date.parse(record.generatedAt)

  if (
    cacheState === 'grace' &&
    (
      !Number.isFinite(generatedAt) ||
      now - generatedAt > OFFICIAL_WARNING_FRESH_MS + OFFICIAL_WARNING_GRACE_MS
    )
  ) {
    return null
  }

  return {
    ...record,
    cacheState,
    gracePeriodMinutes: OFFICIAL_WARNING_GRACE_MS / 60_000,
    warnings: record.warnings.flatMap(warning => {
      const expiresAt = warning.expiresAt ? Date.parse(warning.expiresAt) : NaN
      const expiredAge = Number.isFinite(expiresAt) ? now - expiresAt : 0

      if (expiredAge > OFFICIAL_WARNING_GRACE_MS) {
        return []
      }

      return [{
        ...warning,
        state: cacheState === 'grace' || expiredAge > 0 ? 'grace' as const : 'active' as const
      }]
    })
  }
}

function isLikelyUnitedStates(latitude: number, longitude: number) {
  return [
    [24, 50, -125, -66],
    [50, 72, -180, -129],
    [50, 72, 170, 180],
    [18, 23, -161, -154],
    [17, 19, -68, -64],
    [12, 22, 130, 155],
    [-20, -10, -175, -165]
  ].some(([south, north, west, east]) => (
    latitude >= south &&
    latitude <= north &&
    longitude >= west &&
    longitude <= east
  ))
}

function isLikelyEurope(latitude: number, longitude: number) {
  return (
    latitude >= 20 &&
    latitude <= 75 &&
    longitude >= -35 &&
    longitude <= 55
  )
}

function normalizeCoordinate(value: number) {
  const rounded = Math.round(value * 1000) / 1000

  return Object.is(rounded, -0) ? 0 : rounded
}
