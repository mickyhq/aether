const PROVIDERS = new Set([
  'air-quality',
  'ecmwf',
  'geocoding',
  'warnings',
  'jet-stream',
  'map-weather',
  'ocean-currents',
  'radar',
  'reported-fires',
  'seismic',
  'soil-moisture',
  'stargazing',
  'temperature-records',
  'temperature-anomaly',
  'volcanoes',
  'weather',
  'webcams'
])

export default function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const animation = sanitizeAnimation(request.body?.animation)
  const providers = Array.isArray(request.body?.providers)
    ? request.body.providers.map(sanitizeProvider).filter(Boolean).slice(0, 20)
    : []

  if (!animation && providers.length === 0) {
    response.status(204).send('')
    return
  }

  console.info(JSON.stringify({
    event: 'aether.client-performance',
    ...(animation ? { animation } : {}),
    ...(providers.length > 0 ? { providers } : {})
  }))
  response.status(204).send('')
}

function sanitizeAnimation(value) {
  if (!value || typeof value !== 'object') return null

  const sampleCount = boundedInteger(value.sampleCount, 1, 100000)
  const averageFrameMs = boundedNumber(value.averageFrameMs, 0, 2000)
  const maximumFrameMs = boundedNumber(value.maximumFrameMs, 0, 2000)

  if (sampleCount === null || averageFrameMs === null || maximumFrameMs === null) {
    return null
  }

  const longFrameCount = boundedInteger(value.longFrameCount, 0, sampleCount) ?? 0

  return { sampleCount, averageFrameMs, maximumFrameMs, longFrameCount }
}

function sanitizeProvider(value) {
  if (!value || !PROVIDERS.has(value.provider)) return null

  return {
    provider: value.provider,
    failures: boundedInteger(value.failures, 0, 10000) ?? 0,
    aborts: boundedInteger(value.aborts, 0, 10000) ?? 0
  }
}

function boundedInteger(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : null
}

function boundedNumber(value, minimum, maximum) {
  return typeof value === 'number' && Number.isFinite(value) &&
    value >= minimum && value <= maximum
    ? Math.round(value * 100) / 100
    : null
}
