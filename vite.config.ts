import { defineConfig } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import {
  AIR_QUALITY_PARAMETER_CONFIG,
  WEATHER_PARAMETER_CONFIG,
  buildCanonicalOpenMeteoParams
} from './server/openMeteoParams.js'

type WeatherCacheRecord = {
  body: string
  contentType: string
  expiresAt: number
  staleUntil: number
}

type UpstreamResult = {
  status: number
  body: string
  contentType: string
  retryAfter?: string
}

type Next = (error?: unknown) => void

const pending = new Map<string, Promise<UpstreamResult>>()
const blockedUntil = new Map<string, number>()
let lastUpstreamTime = 0
const MIN_SPACING_MS = 300
const DEFAULT_RETRY_AFTER_SECONDS = 15 * 60

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
      retryAfter: String(blockedFor)
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

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Aether Local Development'
    }
  })
  lastUpstreamTime = Date.now()
  const body = await response.text()
  const result: UpstreamResult = {
    status: response.status,
    body,
    contentType: response.headers.get('content-type') ?? 'application/json'
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

export default defineConfig({
  plugins: [react(), localWeatherApi()]
})

function localWeatherApi(): Plugin {
  const cache = new Map<string, WeatherCacheRecord>()

  const handleWeatherRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
    next: Next
  ) => {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost')

    const upstreamEndpoint = requestUrl.pathname === '/api/weather'
      ? 'https://api.open-meteo.com/v1/forecast'
      : requestUrl.pathname === '/api/air-quality'
        ? 'https://air-quality-api.open-meteo.com/v1/air-quality'
        : null

    if (!upstreamEndpoint) {
      next()
      return
    }

    if (request.method !== 'GET') {
      response.statusCode = 405
      response.end(JSON.stringify({ error: 'Method not allowed' }))
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
      sendCachedWeather(response, cached)
      return
    }

    try {
      const result = await scheduleUpstream(`${upstreamEndpoint}?${canonicalQuery}`)

      if (result.status >= 200 && result.status < 300) {
        const freshness = requestUrl.pathname === '/api/air-quality'
          ? 60 * 60 * 1000
          : 5 * 60 * 1000
        const record = {
          body: result.body,
          contentType: result.contentType,
          expiresAt: now + freshness,
          staleUntil: now + 24 * 60 * 60 * 1000
        }

        cache.set(cacheKey, record)
        sendCachedWeather(response, record)
        return
      }

      if (cached && cached.staleUntil > now) {
        sendCachedWeather(response, cached)
        return
      }

      response.statusCode = result.status
      response.setHeader('Content-Type', result.contentType)

      if (result.retryAfter) {
        response.setHeader('Retry-After', result.retryAfter)
      }

      response.end(result.body)
    } catch (error) {
      if (cached && cached.staleUntil > now) {
        sendCachedWeather(response, cached)
        return
      }

      next(error)
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

function sendCachedWeather(response: ServerResponse, record: WeatherCacheRecord) {
  response.statusCode = 200
  response.setHeader('Content-Type', record.contentType)
  response.setHeader('Cache-Control', 'public, max-age=60')
  response.end(record.body)
}
