import { describe, expect, test } from 'vitest'
import { interpolateWeatherAt } from '../src/services/weatherGrid'
import type { WeatherMapSample } from '../src/types/weather'
import { degreesToRadians } from '../src/utils/geo'

describe('interpolateWeatherAt', () => {
  test('returns null without samples', () => {
    expect(interpolateWeatherAt(0, 0, [])).toBeNull()
  })

  test('blends scalar weather values by distance', () => {
    const samples = [
      buildSample(-1, 10, 1, 0.2, false),
      buildSample(1, 30, 3, 0.8, true)
    ]
    const result = interpolateWeatherAt(0, 0, samples)

    expect(result?.temperature).toBeCloseTo(20)
    expect(result?.precipitation).toBeCloseTo(2)
    expect(result?.cloudOpacity).toBeCloseTo(0.5)
    expect(result?.isThunderstorm).toBe(false)
  })

  test('interpolates wind as vectors across north', () => {
    const samples = [
      buildSample(-1, 20, 0, 0.3, false, 350),
      buildSample(1, 20, 0, 0.3, false, 10)
    ]
    const result = interpolateWeatherAt(0, 0, samples)

    expect(result?.rawWindSpeed).toBeCloseTo(19.696, 2)
    expect(
      Math.min(
        result?.windAngle ?? Infinity,
        Math.PI * 2 - (result?.windAngle ?? 0)
      )
    ).toBeCloseTo(0, 5)
  })
})

function buildSample(
  longitude: number,
  temperature: number,
  precipitation: number,
  cloudOpacity: number,
  isThunderstorm: boolean,
  windDirection = 0
): WeatherMapSample {
  return {
    label: String(longitude),
    latitude: 0,
    longitude,
    temperature,
    precipitation,
    snowfall: 0,
    weatherCode: isThunderstorm ? 95 : 0,
    windSpeed: 0.25,
    rawWindSpeed: 20,
    windAngle: degreesToRadians(windDirection),
    cloudOpacity,
    isThunderstorm
  }
}
