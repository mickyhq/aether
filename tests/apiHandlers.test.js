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
    'pressure_msl',
    'wind_speed_10m',
    'wind_direction_10m'
  ].join(','),
  hourly: 'precipitation,pressure_msl'
}
const weatherCacheKey = [
  'latitude=48.000',
  'longitude=2.000',
  'current=cloud_cover%2Cpressure_msl%2Ctemperature_2m%2Cweather_code%2Cwind_direction_10m%2Cwind_speed_10m',
  'hourly=precipitation%2Cpressure_msl'
].join('&')
const legacyWeatherCacheKey = [
  'latitude=48.000',
  'longitude=2.000',
  'current=cloud_cover%2Ctemperature_2m%2Cweather_code%2Cwind_direction_10m%2Cwind_speed_10m',
  'hourly=precipitation'
].join('&')

describe('weather API handler', () => {
  beforeEach(() => {
    runtime.entries.clear()
    process.env.VERCEL = '1'
    delete process.env.ECMWF_KEY
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

  test('uses pressure fallback when stale data has no pressure', async () => {
    runtime.entries.set('provider-blocked-until', Date.now() + 60_000)
    runtime.entries.set(
      `stale:${legacyWeatherCacheKey}`,
      record(legacyWeather())
    )
    vi.stubGlobal('fetch', vi.fn(async () => (
      new Response(JSON.stringify(validMetWeather()), { status: 200 })
    )))
    const response = createResponse()

    await weatherHandler({ method: 'GET', query: weatherQuery }, response)

    expect(response.statusCode).toBe(200)
    expect(response.headers['X-Aether-Cache']).toBe('upstream')
    expect(response.body).toContain('"pressure_msl":1014')
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

  test('uses customer Jet Stream data while the free provider is blocked', async () => {
    runtime.entries.set('provider-blocked-until', Date.now() + 60_000)
    process.env.ECMWF_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn(async () => (
      new Response(JSON.stringify([{
        current: {
          wind_speed_250hPa: 152,
          wind_direction_250hPa: 268
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
    expect(response.body).toContain('"wind_speed_250hPa":152')
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
      pressure_msl: 1016,
      wind_speed_10m: 10,
      wind_direction_10m: 180
    },
    hourly: {
      time: ['2026-06-29T12:00'],
      precipitation: [0],
      pressure_msl: [1016]
    }
  }
}

function legacyWeather() {
  const weather = validWeather()

  delete weather.current.pressure_msl
  delete weather.hourly.pressure_msl

  return weather
}

function validMetWeather() {
  return {
    properties: {
      timeseries: [{
        time: '2026-06-29T12:00:00Z',
        data: {
          instant: {
            details: {
              air_pressure_at_sea_level: 1014,
              air_temperature: 20,
              cloud_area_fraction: 30,
              relative_humidity: 55,
              wind_from_direction: 220,
              wind_speed: 4
            }
          },
          next_1_hours: {
            summary: { symbol_code: 'partlycloudy_day' },
            details: { precipitation_amount: 0 }
          }
        }
      }]
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
