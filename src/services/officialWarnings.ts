import type { OfficialWarningsData, WeatherLocation } from '../types/weather'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import {
  officialWarningsResponseSchema,
  parseResponseJson
} from '../schemas/serverResponses'
import { recordProviderFailure } from './clientTelemetry'

export async function fetchOfficialWarnings(
  location: WeatherLocation,
  signal?: AbortSignal
): Promise<OfficialWarningsData> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude)
  })
  const response = await fetchWithTimeout(
    `/api/warnings?${params.toString()}`,
    { signal },
    30000
  )

  if (!response.ok) {
    recordProviderFailure('warnings')
    throw new Error(`Official warnings error ${response.status}`)
  }

  return parseResponseJson(
    response,
    officialWarningsResponseSchema,
    'Official warnings response'
  )
}

export function enterOfficialWarningGrace(data: OfficialWarningsData) {
  return ageOfficialWarnings({
    ...data,
    cacheState: 'grace',
    warnings: data.warnings.map(warning => ({
      ...warning,
      state: 'grace' as const
    }))
  })
}

export function ageOfficialWarnings(
  data: OfficialWarningsData,
  now = Date.now()
): OfficialWarningsData | null {
  const generatedAt = Date.parse(data.generatedAt)
  const graceMs = data.gracePeriodMinutes * 60_000

  if (
    data.cacheState === 'grace' &&
    (
      !Number.isFinite(generatedAt) ||
      now - generatedAt > 5 * 60_000 + graceMs
    )
  ) {
    return null
  }

  return {
    ...data,
    warnings: data.warnings.flatMap(warning => {
      const expiresAt = warning.expiresAt ? Date.parse(warning.expiresAt) : NaN
      const expiredAge = Number.isFinite(expiresAt) ? now - expiresAt : 0

      if (expiredAge > graceMs) {
        return []
      }

      return [{
        ...warning,
        state: data.cacheState === 'grace' || expiredAge > 0
          ? 'grace' as const
          : 'active' as const
      }]
    })
  }
}
