import { defineConfig } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

type WeatherCacheRecord = {
  body: string
  contentType: string
  expiresAt: number
  staleUntil: number
}

type Next = (error?: unknown) => void

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

    if (requestUrl.pathname !== '/api/weather') {
      next()
      return
    }

    if (request.method !== 'GET') {
      response.statusCode = 405
      response.end(JSON.stringify({ error: 'Method not allowed' }))
      return
    }

    const key = requestUrl.search
    const cached = cache.get(key)
    const now = Date.now()

    if (cached && cached.expiresAt > now) {
      sendCachedWeather(response, cached)
      return
    }

    try {
      const upstream = await fetch(
        `https://api.open-meteo.com/v1/forecast${requestUrl.search}`,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Aether Local Development'
          }
        }
      )
      const body = await upstream.text()

      if (upstream.ok) {
        const record = {
          body,
          contentType: upstream.headers.get('content-type') ?? 'application/json',
          expiresAt: now + 5 * 60 * 1000,
          staleUntil: now + 6 * 60 * 60 * 1000
        }

        cache.set(key, record)
        sendCachedWeather(response, record)
        return
      }

      if (cached && cached.staleUntil > now) {
        sendCachedWeather(response, cached)
        return
      }

      response.statusCode = upstream.status
      response.setHeader('Content-Type', 'application/json')
      response.end(body)
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
