import { describe, expect, test } from 'vitest'
import {
  clamp,
  degreesToRadians,
  distanceInKilometers,
  inverseDistanceWeight,
  normalizeAngle,
  normalizeLongitude,
  radiansToDegrees
} from '../src/utils/geo'

describe('geo utilities', () => {
  test('normalizes longitudes and angles', () => {
    expect(normalizeLongitude(181)).toBe(-179)
    expect(normalizeLongitude(-181)).toBe(179)
    expect(normalizeLongitude(540)).toBe(-180)
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo(Math.PI * 1.5)
    expect(normalizeAngle(Math.PI * 2.5)).toBeCloseTo(Math.PI / 2)
  })

  test('converts degrees and radians', () => {
    expect(degreesToRadians(180)).toBeCloseTo(Math.PI)
    expect(radiansToDegrees(Math.PI / 2)).toBeCloseTo(90)
  })

  test('measures the shortest path across the date line', () => {
    const distance = distanceInKilometers(
      { latitude: 0, longitude: 179 },
      { latitude: 0, longitude: -179 }
    )

    expect(distance).toBeGreaterThan(220)
    expect(distance).toBeLessThan(225)
  })

  test('clamps values and caps inverse-distance weight', () => {
    expect(clamp(12, 0, 10)).toBe(10)
    expect(clamp(-2, 0, 10)).toBe(0)
    expect(inverseDistanceWeight(0)).toBe(100)
    expect(inverseDistanceWeight(2)).toBe(0.25)
  })
})
