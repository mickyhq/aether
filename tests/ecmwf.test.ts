import { afterEach, expect, test, vi } from 'vitest'
import { fetchEcmwfLocationForecast } from '../src/services/ecmwf'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('maps ECMWF hourly data into visual forecast frames', async () => {
  const fetchMock = vi.fn(async (
    _input: RequestInfo | URL,
    _init?: RequestInit
  ) => new Response(JSON.stringify({
    latitude: 48,
    longitude: 2,
    utc_offset_seconds: 7200,
    hourly: {
      time: ['2026-06-29T12:00'],
      temperature_2m: [24],
      precipitation: [1.2],
      snowfall: [0],
      weather_code: [95],
      cloud_cover: [80],
      pressure_msl: [996],
      wind_speed_10m: [32],
      wind_direction_10m: [180]
    },
    model: 'Standard forecast'
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  }))

  vi.stubGlobal('fetch', fetchMock)

  const result = await fetchEcmwfLocationForecast({
    label: 'Paris',
    latitude: 48,
    longitude: 2
  })

  expect(result.model).toBe('Standard forecast')
  expect(result.frames[0]).toMatchObject({
    time: '2026-06-29T10:00:00.000Z',
    temperature: 24,
    precipitation: 1.2,
    pressureMsl: 996,
    rawWindSpeed: 32,
    isThunderstorm: true
  })
  expect(String(fetchMock.mock.calls[0][0])).toContain('/api/ecmwf?')
  expect(String(fetchMock.mock.calls[0][0])).not.toContain('apikey')
})
