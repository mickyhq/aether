import { afterEach, expect, test, vi } from 'vitest'
import { fetchEcmwfForecast } from '../server/ecmwfProvider.js'

const originalEcmwfKey = process.env.ECMWF_KEY

afterEach(() => {
  process.env.ECMWF_KEY = originalEcmwfKey
  vi.unstubAllGlobals()
})

test('requests only the ECMWF IFS model', async () => {
  process.env.ECMWF_KEY = ''

  const fetchMock = vi.fn(async () => new Response(JSON.stringify({
    hourly: {
      time: ['2026-06-29T12:00'],
      temperature_2m: [24],
      precipitation: [0],
      snowfall: [0],
      weather_code: [1],
      cloud_cover: [20],
      pressure_msl: [1018],
      wind_speed_10m: [12],
      wind_direction_10m: [180]
    }
  }), { status: 200 }))

  vi.stubGlobal('fetch', fetchMock)

  await fetchEcmwfForecast(48, 2, 120)

  const url = new URL(String(fetchMock.mock.calls[0][0]))

  expect(url.origin).toBe('https://api.open-meteo.com')
  expect(url.pathname).toBe('/v1/forecast')
  expect(url.searchParams.has('apikey')).toBe(false)
  expect(url.searchParams.get('models')).toBe('ecmwf_ifs')
  expect(url.searchParams.get('hourly')).toContain('pressure_msl')
})

test('uses ECMWF key on the customer endpoint when present', async () => {
  process.env.ECMWF_KEY = 'test-key'

  const fetchMock = vi.fn(async () => new Response(JSON.stringify({
    hourly: {
      time: ['2026-06-29T12:00'],
      temperature_2m: [24],
      precipitation: [0],
      snowfall: [0],
      weather_code: [1],
      cloud_cover: [20],
      pressure_msl: [1018],
      wind_speed_10m: [12],
      wind_direction_10m: [180]
    }
  }), { status: 200 }))

  vi.stubGlobal('fetch', fetchMock)

  const result = await fetchEcmwfForecast(48, 2, 120)
  const url = new URL(String(fetchMock.mock.calls[0][0]))

  expect(url.origin).toBe('https://customer-api.open-meteo.com')
  expect(url.searchParams.get('apikey')).toBe('test-key')
  expect(result.model).toBe('ECMWF IFS 9 km')
})

test('falls back to standard Open-Meteo forecast when ECMWF is rejected', async () => {
  process.env.ECMWF_KEY = ''

  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      error: true,
      reason: 'Daily API request limit exceeded'
    }), { status: 429 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      hourly: {
        time: ['2026-06-29T12:00'],
        temperature_2m: [22],
        precipitation: [0],
        snowfall: [0],
        weather_code: [2],
        cloud_cover: [40],
        pressure_msl: [1004],
        wind_speed_10m: [10],
        wind_direction_10m: [90]
      }
    }), { status: 200 }))

  vi.stubGlobal('fetch', fetchMock)

  const result = await fetchEcmwfForecast(48, 2, 120)
  const fallbackUrl = new URL(String(fetchMock.mock.calls[1][0]))

  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(fallbackUrl.searchParams.has('models')).toBe(false)
  expect(result.model).toBe('Standard forecast')
})
