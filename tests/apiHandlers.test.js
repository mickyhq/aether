import { beforeEach, describe, expect, test, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  entries: new Map()
}))

vi.mock('@vercel/functions', () => ({
  getCache: () => ({
    get: async key => runtime.entries.get(key) ?? null,
    set: async (key, value) => {
      runtime.entries.set(key, value)
    }
  })
}))

import weatherHandler from '../routes/weather.js'
import airQualityHandler from '../routes/air-quality.js'

const weatherQuery = {
  latitude: '48',
  longitude: '2',
  current: [
    'temperature_2m',
    'weather_code',
    'cloud_cover',
    'wind_speed_10m',
    'wind_direction_10m'
  ].join(','),
  hourly: 'precipitation'
}
const weatherCacheKey = [
  'latitude=48.000',
  'longitude=2.000',
  'current=cloud_cover%2Ctemperature_2m%2Cweather_code%2Cwind_direction_10m%2Cwind_speed_10m',
  'hourly=precipitation'
].join('&')

describe('weather API handler', () => {
  beforeEach(() => {
    runtime.entries.clear()
    process.env.VERCEL = '1'
    vi.restoreAllMocks()
  })

  test('serves a Runtime Cache hit and logs the metric', async () => {
    runtime.entries.set(`fresh:${weatherCacheKey}`, record(validWeather()))
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    const response = createResponse()

    await weatherHandler({ method: 'GET', query: weatherQuery }, response)

    expect(response.statusCode).toBe(200)
    expect(response.headers['X-Aether-Cache']).toBe('runtime')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"cacheHitCount":1'))
  })

  test('serves stale data when the provider fails', async () => {
    runtime.entries.set(`stale:${weatherCacheKey}`, record(validWeather()))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    const response = createResponse()

    await weatherHandler({ method: 'GET', query: weatherQuery }, response)

    expect(response.statusCode).toBe(200)
    expect(response.headers['X-Aether-Cache']).toBe('stale')
  })

  test('rejects malformed provider data instead of caching it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => (
      new Response('{"broken":true}', { status: 200 })
    )))
    const response = createResponse()

    await weatherHandler({ method: 'GET', query: weatherQuery }, response)

    expect(response.statusCode).toBe(502)
    expect(runtime.entries.has(`fresh:${weatherCacheKey}`)).toBe(false)
  })

  test('accepts Jet Stream only provider data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => (
      new Response(JSON.stringify([{
        current: {
          wind_speed_250hPa: 145,
          wind_direction_250hPa: 275
        }
      }]), { status: 200 })
    )))
    const response = createResponse()

    await weatherHandler({
      method: 'GET',
      query: {
        latitude: '48',
        longitude: '2',
        current: 'wind_speed_250hPa,wind_direction_250hPa'
      }
    }, response)

    expect(response.statusCode).toBe(200)
    expect(response.headers['X-Aether-Cache']).toBe('upstream')
  })
})

describe('air-quality API handler', () => {
  test('rejects malformed provider data', async () => {
    runtime.entries.clear()
    process.env.VERCEL = '1'
    vi.stubGlobal('fetch', vi.fn(async () => (
      new Response('{"current":{}}', { status: 200 })
    )))
    const response = createResponse()

    await airQualityHandler({
      method: 'GET',
      query: {
        latitude: '48',
        longitude: '2',
        current: 'european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone'
      }
    }, response)

    expect(response.statusCode).toBe(502)
  })
})

function validWeather() {
  return {
    current: {
      temperature_2m: 21,
      weather_code: 1,
      cloud_cover: 20,
      wind_speed_10m: 10,
      wind_direction_10m: 180
    },
    hourly: {
      time: ['2026-06-29T12:00'],
      precipitation: [0]
    }
  }
}

function record(value) {
  return {
    body: JSON.stringify(value),
    contentType: 'application/json',
    rateLimitLimit: null,
    rateLimitRemaining: null
  }
}

function createResponse() {
  return {
    body: null,
    headers: {},
    statusCode: 0,
    setHeader(name, value) {
      this.headers[name] = value
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(value) {
      this.body = value
      return this
    },
    send(value) {
      this.body = value
      return this
    }
  }
}
