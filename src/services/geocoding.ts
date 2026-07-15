import type { WeatherLocation } from '../types/weather'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import {
  reverseGeocodeResponseSchema,
  searchGeocodeResponseSchema
} from '../schemas/serverResponses'
import type { SearchGeocodeResponse } from '../schemas/serverResponses'

export async function reverseGeocode(
  latitude: number,
  longitude: number,
  signal?: AbortSignal
): Promise<string> {
  const fallback = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`
  const params = new URLSearchParams({
    type: 'reverse',
    latitude: String(latitude),
    longitude: String(longitude)
  })

  try {
    const response = await fetchWithTimeout(`/api/geocode?${params}`, { signal })

    if (!response.ok) {
      return fallback
    }

    const payload = reverseGeocodeResponseSchema.parse(
      await response.json(),
      'Reverse geocoding response'
    )

    return typeof payload.label === 'string' ? payload.label : fallback
  } catch (error) {
    if (signal?.aborted) {
      throw error
    }

    return fallback
  }
}

export async function searchCity(query: string): Promise<WeatherLocation> {
  const trimmedQuery = query.trim()

  if (!trimmedQuery) {
    throw new Error('Enter city')
  }

  const params = new URLSearchParams({
    type: 'search',
    query: trimmedQuery
  })
  const response = await fetchWithTimeout(`/api/geocode?${params}`)
  const payload = await readSearchResponse(response)

  if (!response.ok || !payload.location) {
    throw new Error(payload.error ?? `City search error ${response.status}`)
  }

  return payload.location
}

async function readSearchResponse(
  response: Response
): Promise<SearchGeocodeResponse> {
  const contentType = response.headers.get('content-type') ?? ''

  if (!contentType.includes('application/json')) {
    return {
      error: response.ok
        ? 'City search returned an invalid response'
        : `City search error ${response.status}`
    }
  }

  try {
    return searchGeocodeResponseSchema.parse(
      await response.json(),
      'City search response'
    )
  } catch {
    return {
      error: 'City search returned invalid JSON'
    }
  }
}
