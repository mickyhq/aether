import type { HeatAlert, WeatherLocation } from '../types/weather'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import {
  heatAlertsResponseSchema,
  parseResponseJson
} from '../schemas/serverResponses'

export async function fetchOfficialHeatAlerts(
  location: WeatherLocation,
  signal?: AbortSignal
): Promise<HeatAlert[]> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude)
  })
  const response = await fetchWithTimeout(
    `/api/heat-alerts?${params.toString()}`,
    { signal }
  )

  if (!response.ok) {
    return []
  }

  const payload = await parseResponseJson(
    response,
    heatAlertsResponseSchema,
    'Heat alerts response'
  )

  return payload.alerts
}
