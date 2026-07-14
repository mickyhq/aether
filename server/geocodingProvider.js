import { fetchCoalesced } from './coalescedFetch.js'

const SEARCH_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search'
const REVERSE_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse'
const NOMINATIM_INTERVAL_MS = 1000
let nextNominatimRequestAt = 0
let nominatimQueue = Promise.resolve()

export function parseGeocodeRequest(params) {
  const type = params.get('type')

  if (type === 'search') {
    const query = params.get('query')?.trim()

    return query
      ? { type, query, cacheKey: `search:${query.toLowerCase()}` }
      : null
  }

  if (type === 'reverse') {
    const latitude = Number(params.get('latitude'))
    const longitude = Number(params.get('longitude'))

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
      type,
      latitude,
      longitude,
      cacheKey: `reverse:${latitude.toFixed(4)}:${longitude.toFixed(4)}`
    }
  }

  return null
}

export async function fetchGeocode(request) {
  if (request.type === 'search') {
    return searchLocation(request.query)
  }

  return reverseLocation(request.latitude, request.longitude)
}

async function searchLocation(query) {
  const url = new URL(SEARCH_ENDPOINT)

  url.searchParams.set('name', query)
  url.searchParams.set('count', '1')
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')

  const response = await fetchCoalesced(
    `geocode-search:${query.toLowerCase()}`,
    url.toString(),
    'Aether Weather Map',
    {},
    'geocoding'
  )

  if (!response.ok) {
    throw new Error(`City search error ${response.status}`)
  }

  const payload = JSON.parse(response.body)
  const result = payload?.results?.[0]

  if (
    !result ||
    typeof result.name !== 'string' ||
    !Number.isFinite(result.latitude) ||
    !Number.isFinite(result.longitude)
  ) {
    throw new Error('City not found')
  }

  return {
    location: {
      latitude: result.latitude,
      longitude: result.longitude,
      label: [result.name, result.admin1, result.country]
        .filter(value => typeof value === 'string' && value)
        .join(', ')
    }
  }
}

async function reverseLocation(latitude, longitude) {
  const url = new URL(REVERSE_ENDPOINT)

  url.searchParams.set('lat', String(latitude))
  url.searchParams.set('lon', String(longitude))
  url.searchParams.set('format', 'json')
  url.searchParams.set('zoom', '10')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('accept-language', 'en')

  await reserveNominatimSlot()

  const response = await fetchCoalesced(
    `geocode-reverse:${latitude.toFixed(4)}:${longitude.toFixed(4)}`,
    url.toString(),
    'Aether Weather Map (https://aether-five-rose.vercel.app)',
    {},
    'geocoding'
  )

  if (!response.ok) {
    throw new Error(`Reverse geocoding error ${response.status}`)
  }

  const payload = JSON.parse(response.body)
  const address = payload?.address
  const fallback = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`

  if (!address || typeof address !== 'object') {
    return { label: fallback }
  }

  const locality = (
    address.city ||
    address.town ||
    address.village ||
    address.hamlet ||
    address.suburb ||
    address.municipality ||
    address.county
  )
  const region = address.state || address.country

  return {
    label: locality && region
      ? `${locality}, ${region}`
      : locality || fallback
  }
}

function reserveNominatimSlot() {
  const reservation = nominatimQueue.then(async () => {
    const wait = Math.max(0, nextNominatimRequestAt - Date.now())

    if (wait > 0) {
      await new Promise(resolve => setTimeout(resolve, wait))
    }

    nextNominatimRequestAt = Date.now() + NOMINATIM_INTERVAL_MS
  })

  nominatimQueue = reservation.catch(() => undefined)

  return reservation
}
