import { describe, expect, test } from 'vitest'
import type { OpenMeteoResponse } from '../src/types/weather'
import { translateWeather } from '../src/weather/translateWeather'

describe('translateWeather', () => {
  test('translates current and hourly weather into display data', () => {
    const weather = translateWeather(buildPayload(), {
      label: 'Test Valley',
      latitude: 48,
      longitude: 2
    })

    expect(weather.zone).toBe('Test Valley')
    expect(weather.description).toBe('Thunderstorm')
    expect(weather.precipitation).toBe(4)
    expect(weather.pressureMsl).toBe(998)
    expect(weather.windSpeed).toBe(1)
    expect(weather.windAngle).toBeCloseTo(Math.PI / 2)
    expect(weather.cloudOpacity).toBe(1)
    expect(weather.rainDensity).toBe(168)
    expect(weather.isThunderstorm).toBe(true)
    expect(weather.sunrise).toBe('2026-06-29T05:00:00.000Z')
    expect(weather.sunset).toBe('2026-06-29T22:00:00.000Z')
    expect(weather.evolution).toHaveLength(2)
    expect(weather.evolution[1]).toMatchObject({
      weatherCode: 71,
      cloudOpacity: 0,
      pressureMsl: 1002,
      windSpeed: 0.5,
      isThunderstorm: false
    })
  })

  test('detects a multi-day heat wave', () => {
    const weather = translateWeather(buildPayload(), {
      label: '',
      latitude: 48,
      longitude: 2
    })

    expect(weather.zone).toBe('Europe/Paris')
    expect(weather.heatRisk).toEqual({
      kind: 'heat-wave',
      days: 3,
      maximumTemperature: 42
    })
  })
})

function buildPayload(): OpenMeteoResponse {
  return {
    latitude: 48,
    longitude: 2,
    timezone: 'Europe/Paris',
    current: {
      temperature_2m: 36,
      relative_humidity_2m: 64,
      rain: 2,
      showers: 4,
      snowfall: 0,
      weather_code: 95,
      cloud_cover: 130,
      pressure_msl: 998,
      wind_speed_10m: 100,
      wind_direction_10m: 90
    },
    hourly: {
      time: ['2026-06-29T12:00', '2026-06-29T13:00'],
      temperature_2m: [36, 35],
      precipitation: [3, 0],
      snowfall: [0, 1],
      weather_code: [95, 71],
      cloud_cover: [120, -20],
      pressure_msl: [998, 1002],
      wind_speed_10m: [80, 40],
      wind_direction_10m: [90, 180]
    },
    daily: {
      time: ['2026-06-29', '2026-06-30', '2026-07-01'],
      temperature_2m_max: [35, 36, 37],
      temperature_2m_min: [23, 24, 25],
      apparent_temperature_max: [39, 42, 40],
      sunrise: ['2026-06-29T05:00'],
      sunset: ['2026-06-29T22:00']
    }
  }
}
