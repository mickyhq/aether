import { defineConfig, loadEnv } from 'vite'
import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import {
  getCacheNamespace
} from './shared/cacheVersion.js'
import {
  AIR_QUALITY_PARAMETER_CONFIG,
  WEATHER_PARAMETER_CONFIG,
  buildCanonicalOpenMeteoParams
} from './server/openMeteoParams.js'
import {
  getOfficialHeatAlerts,
  parseHeatAlertCoordinates
} from './server/heatAlerts.js'
import {
  fetchGeocode,
  parseGeocodeRequest
} from './server/geocodingProvider.js'
import { fetchEcmwfForecast } from './server/ecmwfProvider.js'
import { getReportedFires } from './server/reportedFires.js'
import {
  buildEffisTileUrl,
  parseEffisTileCoordinates
} from './server/effisTile.js'
import {
  buildFireTileUrl,
  parseFireTileCoordinates
} from './server/fireTile.js'
import { fetchTileCoalesced } from './server/coalescedTileFetch.js'
import {
  consumeRequestLimit,
  getRequestClientId,
  setRequestLimitHeaders
} from './server/requestRateLimit.js'
import { fetchWithTimeout } from './shared/fetchTimeout.js'

type WeatherCacheRecord = {
  body: string
  contentType: string
  expiresAt: number
  rateLimitLimit?: string | null
  rateLimitRemaining?: string | null
  staleUntil: number
  upstreamBudget?: string | null
}

type UpstreamResult = {
  status: number
  body: string
  contentType: string
  rateLimitLimit: string | null
  rateLimitRemaining: string | null
  retryAfter?: string
  upstreamBudget: string | null
}

type Next = (error?: unknown) => void

const pending = new Map<string, Promise<UpstreamResult>>()
const blockedUntil = new Map<string, number>()
let lastUpstreamTime = 0
const MIN_SPACING_MS = 300
const LOCAL_UPSTREAM_TIMEOUT_MS = 8000
const DEFAULT_RETRY_AFTER_SECONDS = 15 * 60
const FIRE_TILE_RATE_LIMIT = 240
const FIRE_TILE_RATE_WINDOW_MS = 60 * 1000
const DEPLOYED_API_ORIGIN = 'https://aether-five-rose.vercel.app'
const packageVersion = (
  JSON.parse(
    readFileSync(new URL('./package.json', import.meta.url), 'utf8')
  ) as { version: string }
).version
const buildVersion = `v${packageVersion}`

function scheduleUpstream(url: string): Promise<UpstreamResult> {
  const provider = new URL(url).origin
  const blockedFor = Math.max(
    0,
    Math.ceil(((blockedUntil.get(provider) ?? 0) - Date.now()) / 1000)
  )

  if (blockedFor > 0) {
    return Promise.resolve({
      status: 429,
      body: JSON.stringify({
        error: 'Weather provider rate limited',
        retryAfter: blockedFor
      }),
      contentType: 'application/json',
      rateLimitLimit: null,
      rateLimitRemaining: null,
      retryAfter: String(blockedFor),
      upstreamBudget: 'critical'
    })
  }

  const existing = pending.get(url)

  if (existing) {
    return existing
  }

  const promise = fetchUpstream(url)
    .finally(() => {
      pending.delete(url)
    })

  pending.set(url, promise)

  return promise
}

async function fetchUpstream(url: string): Promise<UpstreamResult> {
  await ensureSpacing()

  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Aether Local Development'
    }
  }, LOCAL_UPSTREAM_TIMEOUT_MS)
  lastUpstreamTime = Date.now()
  const body = await response.text()
  const result: UpstreamResult = {
    status: response.status,
    body,
    contentType: response.headers.get('content-type') ?? 'application/json',
    rateLimitLimit: readFirstHeader(response.headers, [
      'ratelimit-limit',
      'x-aether-ratelimit-limit',
      'x-ratelimit-limit',
      'x-rate-limit-limit'
    ]),
    rateLimitRemaining: readFirstHeader(response.headers, [
      'ratelimit-remaining',
      'x-aether-ratelimit-remaining',
      'x-ratelimit-remaining',
      'x-rate-limit-remaining'
    ]),
    upstreamBudget: response.headers.get('x-aether-upstream-budget')
  }

  if (response.status === 429) {
    const retryAfter = parseRetryAfter(response.headers.get('retry-after'))
    const provider = new URL(url).origin

    blockedUntil.set(provider, Date.now() + retryAfter * 1000)
    result.retryAfter = String(retryAfter)
  }

  return result
}

function parseRetryAfter(value: string | null) {
  if (!value) {
    return DEFAULT_RETRY_AFTER_SECONDS
  }

  const seconds = Number(value)

  if (Number.isFinite(seconds)) {
    return Math.max(1, Math.ceil(seconds))
  }

  const retryAt = Date.parse(value)

  return Number.isNaN(retryAt)
    ? DEFAULT_RETRY_AFTER_SECONDS
    : Math.max(1, Math.ceil((retryAt - Date.now()) / 1000))
}

async function ensureSpacing() {
  const elapsed = Date.now() - lastUpstreamTime

  if (elapsed < MIN_SPACING_MS) {
    await new Promise(resolve => { setTimeout(resolve, MIN_SPACING_MS - elapsed) })
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  if (!process.env.METEOGATE_KEY && env.METEOGATE_KEY) {
    process.env.METEOGATE_KEY = env.METEOGATE_KEY
  }

  if (!process.env.ECMWF_KEY && env.ECMWF_KEY) {
    process.env.ECMWF_KEY = env.ECMWF_KEY
  }

  if (!process.env.FIRMS_MAP_KEY && env.FIRMS_MAP_KEY) {
    process.env.FIRMS_MAP_KEY = env.FIRMS_MAP_KEY
  }

  return {
    define: {
      'import.meta.env.VITE_AETHER_BUILD_VERSION': JSON.stringify(buildVersion)
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          id: '/',
          name: 'Aether Weather Map',
          short_name: 'Aether',
          description: 'Interactive live weather map with wind, radar, air quality, and Jet Stream layers.',
          categories: ['weather', 'utilities'],
          theme_color: '#071014',
          background_color: '#071014',
          display: 'standalone',
          orientation: 'any',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          cleanupOutdatedCaches: true,
          globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
          globIgnores: ['**/example.png'],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => (
                url.origin === self.location.origin &&
                [
                  '/api/fire-tile',
                  '/api/effis-fire-tile'
                ].includes(url.pathname)
              ),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: getCacheNamespace('fire-tiles'),
                cacheableResponse: {
                  statuses: [0, 200]
                },
                expiration: {
                  maxEntries: 192,
                  maxAgeSeconds: 15 * 60
                }
              }
            },
            {
              urlPattern: ({ url }) => (
                url.origin === self.location.origin &&
                url.pathname.startsWith('/api/') &&
                ![
                  '/api/fire-tile',
                  '/api/effis-fire-tile'
                ].includes(url.pathname)
              ),
              handler: 'NetworkFirst',
              options: {
                cacheName: getCacheNamespace('api'),
                networkTimeoutSeconds: 4,
                cacheableResponse: {
                  statuses: [0, 200]
                },
                expiration: {
                  maxEntries: 120,
                  maxAgeSeconds: 24 * 60 * 60
                }
              }
            }
          ]
        }
      }),
      localWeatherApi()
    ]
  }
})

function localWeatherApi(): Plugin {
  const cache = new Map<string, WeatherCacheRecord>()

  const handleWeatherRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
    next: Next
  ) => {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost')
    const isHeatAlertsRequest = requestUrl.pathname === '/api/heat-alerts'
    const isGeocodeRequest = requestUrl.pathname === '/api/geocode'
    const isEcmwfRequest = requestUrl.pathname === '/api/ecmwf'
    const isFireLayerStatusRequest = requestUrl.pathname === '/api/fire-layer-status'
    const isFireTileRequest = requestUrl.pathname === '/api/fire-tile'
    const isReportedFiresRequest = requestUrl.pathname === '/api/reported-fires'
    const isEffisFireTileRequest = requestUrl.pathname === '/api/effis-fire-tile'

    const upstreamEndpoint = requestUrl.pathname === '/api/weather'
      ? 'https://api.open-meteo.com/v1/forecast'
      : requestUrl.pathname === '/api/air-quality'
        ? 'https://air-quality-api.open-meteo.com/v1/air-quality'
        : null

    if (
      !upstreamEndpoint &&
      !isHeatAlertsRequest &&
      !isGeocodeRequest &&
      !isEcmwfRequest &&
      !isFireLayerStatusRequest &&
      !isFireTileRequest &&
      !isReportedFiresRequest &&
      !isEffisFireTileRequest
    ) {
      next()
      return
    }

    if (request.method !== 'GET') {
      response.statusCode = 405
      response.end(JSON.stringify({ error: 'Method not allowed' }))
      return
    }

    if (isFireLayerStatusRequest) {
      response.statusCode = 200
      response.setHeader('Content-Type', 'application/json')
      response.setHeader('Cache-Control', 'no-store')
      response.end(JSON.stringify({
        firmsConfigured: Boolean(process.env.FIRMS_MAP_KEY?.trim())
      }))
      return
    }

    if (isGeocodeRequest) {
      const parsed = parseGeocodeRequest(requestUrl.searchParams)

      if (!parsed) {
        response.statusCode = 400
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ error: 'Invalid geocoding request' }))
        return
      }

      const cacheKey = `${requestUrl.pathname}?${parsed.cacheKey}`
      const cached = cache.get(cacheKey)
      const now = Date.now()

      if (cached && cached.expiresAt > now) {
        sendCachedWeather(response, cached, 'cached')
        return
      }

      try {
        const record = {
          body: JSON.stringify(await fetchGeocode(parsed)),
          contentType: 'application/json',
          expiresAt: now + 24 * 60 * 60 * 1000,
          staleUntil: now + 7 * 24 * 60 * 60 * 1000
        }

        cache.set(cacheKey, record)
        sendCachedWeather(response, record, 'live')
      } catch (error) {
        if (cached && cached.staleUntil > now) {
          sendCachedWeather(response, cached, 'stale')
          return
        }

        response.statusCode = 502
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({
          error: error instanceof Error
            ? error.message
            : 'Geocoding unavailable'
        }))
      }

      return
    }

    if (isFireTileRequest) {
      const rateLimit = consumeRequestLimit(
        `firms:${getRequestClientId(request)}`,
        FIRE_TILE_RATE_LIMIT,
        FIRE_TILE_RATE_WINDOW_MS
      )

      setRequestLimitHeaders(response, rateLimit)

      if (!rateLimit.allowed) {
        response.statusCode = 429
        response.setHeader('Content-Type', 'application/json')
        response.setHeader('Cache-Control', 'no-store')
        response.setHeader('Retry-After', String(rateLimit.retryAfter))
        response.end(JSON.stringify({
          error: 'NASA FIRMS tile rate limit exceeded'
        }))
        return
      }

      const tile = parseFireTileCoordinates(
        requestUrl.searchParams.get('z'),
        requestUrl.searchParams.get('x'),
        requestUrl.searchParams.get('y')
      )
      const mapKey = process.env.FIRMS_MAP_KEY

      if (!tile) {
        response.statusCode = 400
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ error: 'Invalid tile coordinates' }))
        return
      }

      if (!mapKey) {
        response.statusCode = 503
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ error: 'Fire layer is not configured' }))
        return
      }

      try {
        const upstream = await fetchTileCoalesced(
          `firms:${tile.z}:${tile.x}:${tile.y}`,
          buildFireTileUrl(mapKey, tile),
          LOCAL_UPSTREAM_TIMEOUT_MS
        )
        const contentType = upstream.contentType

        if (!upstream.ok || !contentType.includes('image/png')) {
          throw new Error('Invalid NASA FIRMS tile')
        }

        response.statusCode = 200
        response.setHeader('Content-Type', 'image/png')
        response.setHeader('Cache-Control', 'public, max-age=900')
        response.end(Buffer.from(upstream.body))
      } catch (error) {
        sendUpstreamFailure(response, error, 'NASA FIRMS tile')
      }

      return
    }

    if (isReportedFiresRequest) {
      try {
        response.statusCode = 200
        response.setHeader('Content-Type', 'application/json')
        response.setHeader('Cache-Control', 'public, max-age=900')
        response.end(JSON.stringify({ fires: await getReportedFires() }))
      } catch (error) {
        sendUpstreamFailure(response, error, 'Reported wildfire feed')
      }

      return
    }

    if (isEffisFireTileRequest) {
      const tile = parseEffisTileCoordinates(
        requestUrl.searchParams.get('z'),
        requestUrl.searchParams.get('x'),
        requestUrl.searchParams.get('y')
      )

      if (!tile) {
        response.statusCode = 400
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ error: 'Invalid tile coordinates' }))
        return
      }

      try {
        const upstream = await fetchWithTimeout(
          buildEffisTileUrl(tile),
          { headers: { Accept: 'image/png' } },
          12000
        )
        const contentType = upstream.headers.get('content-type') ?? ''

        if (!upstream.ok || !contentType.includes('image/png')) {
          throw new Error('Invalid Copernicus EFFIS tile')
        }

        response.statusCode = 200
        response.setHeader('Content-Type', 'image/png')
        response.setHeader('Cache-Control', 'public, max-age=900')
        response.end(Buffer.from(await upstream.arrayBuffer()))
      } catch (error) {
        sendUpstreamFailure(response, error, 'Copernicus EFFIS tile')
      }

      return
    }

    if (isEcmwfRequest) {
      const latitude = Number(requestUrl.searchParams.get('latitude'))
      const longitude = Number(requestUrl.searchParams.get('longitude'))
      const forecastHours = Math.min(
        360,
        Math.max(
          24,
          Number(requestUrl.searchParams.get('forecast_hours')) || 120
        )
      )

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        response.statusCode = 400
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ error: 'Invalid coordinates' }))
        return
      }

      const cacheKey = `${requestUrl.pathname}?${latitude.toFixed(3)}:${longitude.toFixed(3)}:${forecastHours}`
      const cached = cache.get(cacheKey)
      const now = Date.now()

      if (cached && cached.expiresAt > now) {
        sendCachedWeather(response, cached, 'cached')
        return
      }

      try {
        const record = {
          body: JSON.stringify(await fetchEcmwfForecast(
            latitude,
            longitude,
            forecastHours
          )),
          contentType: 'application/json',
          expiresAt: now + 3 * 60 * 60 * 1000,
          staleUntil: now + 24 * 60 * 60 * 1000
        }

        cache.set(cacheKey, record)
        sendCachedWeather(response, record, 'live')
      } catch (error) {
        if (cached && cached.staleUntil > now) {
          sendCachedWeather(response, cached, 'stale')
          return
        }

        response.statusCode = 502
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({
          error: error instanceof Error
            ? error.message
            : 'ECMWF forecast unavailable'
        }))
      }

      return
    }

    if (isHeatAlertsRequest) {
      const coordinates = parseHeatAlertCoordinates(
        requestUrl.searchParams.get('latitude'),
        requestUrl.searchParams.get('longitude')
      )

      if (!coordinates) {
        response.statusCode = 400
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ error: 'Invalid coordinates' }))
        return
      }

      const cacheKey = `${requestUrl.pathname}?${coordinates.latitude.toFixed(3)}:${coordinates.longitude.toFixed(3)}`
      const cached = cache.get(cacheKey)
      const now = Date.now()

      if (cached && cached.expiresAt > now) {
        sendCachedWeather(response, cached, 'cached')
        return
      }

      try {
        const record = {
          body: JSON.stringify({
            alerts: await getOfficialHeatAlerts(
              coordinates.latitude,
              coordinates.longitude
            )
          }),
          contentType: 'application/json',
          expiresAt: now + 10 * 60 * 1000,
          staleUntil: now + 24 * 60 * 60 * 1000
        }

        cache.set(cacheKey, record)
        sendCachedWeather(response, record, 'live')
      } catch (error) {
        if (cached && cached.staleUntil > now) {
          sendCachedWeather(response, cached, 'stale')
          return
        }

        sendUpstreamFailure(response, error, 'Official heat alerts')
      }

      return
    }

    const parameterConfig = requestUrl.pathname === '/api/weather'
      ? WEATHER_PARAMETER_CONFIG
      : AIR_QUALITY_PARAMETER_CONFIG
    const canonical = buildCanonicalOpenMeteoParams(
      requestUrl.searchParams,
      parameterConfig
    )

    if (!canonical.params) {
      response.statusCode = 400
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ error: canonical.error }))
      return
    }

    const canonicalQuery = canonical.params.toString()
    const cacheKey = `${requestUrl.pathname}?${canonicalQuery}`
    const cached = cache.get(cacheKey)
    const now = Date.now()

    if (cached && cached.expiresAt > now) {
      sendCachedWeather(response, cached, 'cached')
      return
    }

    try {
      let result = await scheduleUpstream(`${upstreamEndpoint}?${canonicalQuery}`)

      if (result.status === 429) {
        result = await scheduleUpstream(
          `${DEPLOYED_API_ORIGIN}${requestUrl.pathname}?${canonicalQuery}`
        )
      }

      if (result.status >= 200 && result.status < 300) {
        const freshness = requestUrl.pathname === '/api/air-quality'
          ? 60 * 60 * 1000
          : 5 * 60 * 1000
        const record = {
          body: result.body,
          contentType: result.contentType,
          expiresAt: now + freshness,
          rateLimitLimit: result.rateLimitLimit,
          rateLimitRemaining: result.rateLimitRemaining,
          staleUntil: now + 24 * 60 * 60 * 1000,
          upstreamBudget: result.upstreamBudget
        }

        cache.set(cacheKey, record)
        sendCachedWeather(response, record, 'live')
        return
      }

      if (cached && cached.staleUntil > now) {
        sendCachedWeather(response, cached, 'stale')
        return
      }

      response.statusCode = result.status
      response.setHeader('Content-Type', result.contentType)

      if (result.retryAfter) {
        response.setHeader('Retry-After', result.retryAfter)
      }

      if (result.rateLimitLimit) {
        response.setHeader('X-Aether-RateLimit-Limit', result.rateLimitLimit)
      }

      if (result.rateLimitRemaining) {
        response.setHeader(
          'X-Aether-RateLimit-Remaining',
          result.rateLimitRemaining
        )
      }

      if (result.status === 429) {
        response.setHeader('X-Aether-Upstream-Budget', 'critical')
      } else if (result.upstreamBudget) {
        response.setHeader(
          'X-Aether-Upstream-Budget',
          result.upstreamBudget
        )
      }

      response.end(result.body)
    } catch (error) {
      if (cached && cached.staleUntil > now) {
        sendCachedWeather(response, cached, 'stale')
        return
      }

      sendUpstreamFailure(
        response,
        error,
        requestUrl.pathname === '/api/air-quality'
          ? 'Air quality provider'
          : 'Weather provider'
      )
    }
  }

  return {
    name: 'aether-local-weather-api',
    configureServer(server) {
      server.middlewares.use(handleWeatherRequest)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleWeatherRequest)
    }
  }
}

function sendUpstreamFailure(
  response: ServerResponse,
  error: unknown,
  service: string
) {
  const timedOut = error instanceof Error && (
    error.name === 'TimeoutError' ||
    error.message === 'Request timed out'
  )

  response.statusCode = timedOut ? 504 : 502
  response.setHeader('Content-Type', 'application/json')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify({
    error: timedOut
      ? `${service} timed out`
      : `${service} unavailable`
  }))
}

function sendCachedWeather(
  response: ServerResponse,
  record: WeatherCacheRecord,
  cacheStatus: 'live' | 'cached' | 'stale'
) {
  response.statusCode = 200
  response.setHeader('Content-Type', record.contentType)
  response.setHeader('Cache-Control', 'public, max-age=60')
  response.setHeader('X-Aether-Cache', cacheStatus)

  if (record.rateLimitLimit) {
    response.setHeader('X-Aether-RateLimit-Limit', record.rateLimitLimit)
  }

  if (record.rateLimitRemaining) {
    response.setHeader(
      'X-Aether-RateLimit-Remaining',
      record.rateLimitRemaining
    )
  }

  if (cacheStatus === 'stale') {
    response.setHeader('X-Aether-Upstream-Budget', 'low')
  } else if (record.upstreamBudget) {
    response.setHeader('X-Aether-Upstream-Budget', record.upstreamBudget)
  }

  response.end(record.body)
}

function readFirstHeader(headers: Headers, names: string[]) {
  for (const name of names) {
    const value = headers.get(name)

    if (value !== null) {
      return value
    }
  }

  return null
}
