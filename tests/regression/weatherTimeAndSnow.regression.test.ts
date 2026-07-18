import { describe, expect, test } from 'vitest'
import type { OpenMeteoResponse } from '../../src/types/weather'
import {
  normalizeOpenMeteoTime,
  translateWeather
} from '../../src/weather/translateWeather'
import {
  precipitationForecastStyle,
  snowfallForecastStyle
} from '../../src/map/weatherPalette'

describe('weather time and snow regressions', () => {
  test('converts provider wall-clock times into absolute UTC instants', () => {
    expect(normalizeOpenMeteoTime('2026-07-18T14:30', 7200)).toBe(
      '2026-07-18T12:30:00.000Z'
    )
    expect(normalizeOpenMeteoTime('2026-07-18T14:30:00Z', 7200)).toBe(
      '2026-07-18T14:30:00Z'
    )
  })

  test('normalizes observation, forecast, sunrise, and sunset together', () => {
    const weather = translateWeather(buildPayload(), {
      label: 'Snow Town',
      latitude: 46,
      longitude: 7
    }, 1_700_000_000_000)

    expect(weather.provenance.observedAt).toBe('2026-01-15T10:00:00.000Z')
    expect(weather.evolution[0].time).toBe('2026-01-15T10:00:00.000Z')
    expect(weather.sunrise).toBe('2026-01-15T06:45:00.000Z')
    expect(weather.sunset).toBe('2026-01-15T15:50:00.000Z')
    expect(weather.evolution[0].snowfall).toBe(0.8)
    expect(weather.evolution[0].pressureMsl).toBe(1007)
  })

  test('keeps snow visually distinct from rain', () => {
    expect(snowfallForecastStyle(0.01).alpha).toBe(0)
    expect(snowfallForecastStyle(0.8)).not.toEqual(
      precipitationForecastStyle(0.8)
    )
    expect(snowfallForecastStyle(2).alpha).toBeGreaterThan(
      snowfallForecastStyle(0.05).alpha
    )
  })

  test('keeps weather available when an older cache has no pressure', () => {
    const payload = buildPayload()

    delete payload.current.pressure_msl
    delete payload.hourly.pressure_msl

    const weather = translateWeather(payload, {
      label: 'Cached Town',
      latitude: 46,
      longitude: 7
    })

    expect(weather.temperature).toBe(-2)
    expect(weather.pressureMsl).toBeUndefined()
    expect(weather.evolution[0].pressureMsl).toBeUndefined()
  })
})

function buildPayload(): OpenMeteoResponse {
  return {
    latitude: 46,
    longitude: 7,
    timezone: 'Europe/Zurich',
    utc_offset_seconds: 3600,
    current: {
      time: '2026-01-15T11:00',
      temperature_2m: -2,
      relative_humidity_2m: 90,
      rain: 0,
      showers: 0,
      snowfall: 0.8,
      weather_code: 71,
      cloud_cover: 100,
      pressure_msl: 1007,
      wind_speed_10m: 12,
      wind_direction_10m: 20
    },
    hourly: {
      time: ['2026-01-15T11:00'],
      temperature_2m: [-2],
      precipitation: [0.8],
      snowfall: [0.8],
      weather_code: [71],
      cloud_cover: [100],
      pressure_msl: [1007],
      wind_speed_10m: [12],
      wind_direction_10m: [20]
    },
    daily: {
      time: ['2026-01-15'],
      temperature_2m_max: [0],
      temperature_2m_min: [-5],
      apparent_temperature_max: [-2],
      sunrise: ['2026-01-15T07:45'],
      sunset: ['2026-01-15T16:50']
    }
  }
}
