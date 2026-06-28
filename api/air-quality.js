const OPEN_METEO_ENDPOINT = 'https://air-quality-api.open-meteo.com/v1/air-quality'
const ALLOWED_PARAMETERS = new Set([
  'latitude',
  'longitude',
  'current'
])
const COORDINATE_PATTERN = /^-?\d+(?:\.\d+)?(?:,-?\d+(?:\.\d+)?)*$/

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const latitude = getQueryValue(request.query.latitude)
  const longitude = getQueryValue(request.query.longitude)

  if (
    !latitude ||
    !longitude ||
    !COORDINATE_PATTERN.test(latitude) ||
    !COORDINATE_PATTERN.test(longitude)
  ) {
    response.status(400).json({ error: 'Invalid coordinates' })
    return
  }

  const latitudeCount = latitude.split(',').length
  const longitudeCount = longitude.split(',').length

  if (latitudeCount !== longitudeCount || latitudeCount > 40) {
    response.status(400).json({ error: 'Coordinate batch too large' })
    return
  }

  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(request.query)) {
    if (!ALLOWED_PARAMETERS.has(key)) {
      continue
    }

    const queryValue = getQueryValue(value)

    if (queryValue) {
      params.set(key, queryValue)
    }
  }

  try {
    const upstream = await fetch(`${OPEN_METEO_ENDPOINT}?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Aether Air Quality Map'
      }
    })
    const body = await upstream.text()

    response.status(upstream.status)
    response.setHeader('Content-Type', 'application/json')

    if (upstream.ok) {
      response.setHeader('Cache-Control', 'public, max-age=300')
      response.setHeader(
        'Vercel-CDN-Cache-Control',
        'public, s-maxage=3600, stale-while-revalidate=7200, stale-if-error=86400'
      )
    } else {
      response.setHeader('Cache-Control', 'no-store')
    }

    const retryAfter = upstream.headers.get('retry-after')

    if (retryAfter) {
      response.setHeader('Retry-After', retryAfter)
    }

    response.send(body)
  } catch {
    response.status(502).json({ error: 'Air quality provider unavailable' })
  }
}

function getQueryValue(value) {
  return Array.isArray(value) ? value[0] : value
}
