import type { NearbyWebcams, WeatherLocation } from '../types/weather'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import {
  nearbyWebcamsResponseSchema,
  webcamResponseSchema
} from '../schemas/serverResponses'
import type { WebcamResponse } from '../schemas/serverResponses'

export async function fetchNearbyWebcams(
  location: WeatherLocation,
  signal?: AbortSignal
): Promise<NearbyWebcams> {
  const params = new URLSearchParams({
    resource: 'webcams',
    latitude: String(location.latitude),
    longitude: String(location.longitude)
  })
  const response = await fetchWithTimeout(`/api/weather?${params}`, { signal })
  const payload = await readPayload(response)

  if (!response.ok) {
    if (payload?.configured === false) {
      return {
        configured: false,
        radiusKm: 100,
        total: 0,
        webcams: []
      }
    }

    throw new Error(payload?.error ?? `Webcam error ${response.status}`)
  }

  if (!nearbyWebcamsResponseSchema.is(payload)) {
    throw new Error('Invalid webcam response')
  }

  return payload
}

async function readPayload(response: Response): Promise<WebcamResponse | null> {
  try {
    return webcamResponseSchema.parse(
      await response.json(),
      'Webcam response'
    )
  } catch {
    return null
  }
}
