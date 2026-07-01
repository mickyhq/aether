import { describe, expect, test } from 'vitest'
import {
  getWeatherMapSamplesAtTime,
  interpolateWeatherAt
} from '../src/services/weatherGrid'
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

  test('uses each map point forecast for the played time', () => {
    const first = buildSample(-1, 10, 0, 0.2, false)
    const second = buildSample(1, 20, 0, 0.4, false)

    first.evolution = [
      buildFrame('2026-07-02T12:00:00.000Z', 30, 25, 90)
    ]
    second.evolution = [
      buildFrame('2026-07-02T12:00:00.000Z', 5, 60, 270)
    ]

    const displayed = getWeatherMapSamplesAtTime(
      [first, second],
      '2026-07-02T12:00:00.000Z'
    )

    expect(displayed[0]).toMatchObject({
      temperature: 30,
      rawWindSpeed: 25
    })
    expect(displayed[1]).toMatchObject({
      temperature: 5,
      rawWindSpeed: 60
    })
    expect(first.temperature).toBe(10)
    expect(second.temperature).toBe(20)
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

function buildFrame(
  time: string,
  temperature: number,
  rawWindSpeed: number,
  windDirection: number
) {
  return {
    time,
    temperature,
    precipitation: 2,
    snowfall: 0,
    weatherCode: 3,
    windSpeed: rawWindSpeed / 80,
    rawWindSpeed,
    windAngle: degreesToRadians(windDirection),
    cloudOpacity: 0.75,
    isThunderstorm: false
  }
}
