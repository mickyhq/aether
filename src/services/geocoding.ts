import type { WeatherLocation } from '../types/weather'

type OpenMeteoGeocodingResult = {
  name: string
  latitude: number
  longitude: number
  country?: string
  admin1?: string
}

type OpenMeteoGeocodingResponse = {
  results?: OpenMeteoGeocodingResult[]
}

export async function searchCity(query: string): Promise<WeatherLocation> {
  const trimmedQuery = query.trim()

  if (!trimmedQuery) {
    throw new Error('Enter city')
  }

  const params = new URLSearchParams({
    name: trimmedQuery,
    count: '1',
    language: 'en',
    format: 'json'
  })

  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`)

  if (!response.ok) {
    throw new Error(`City search error ${response.status}`)
  }

  const payload = (await response.json()) as OpenMeteoGeocodingResponse
  const result = payload.results?.[0]

  if (!result) {
    throw new Error('City not found')
  }

  return {
    latitude: result.latitude,
    longitude: result.longitude,
    label: [result.name, result.admin1, result.country].filter(Boolean).join(', ')
  }
}
