import { describe, expect, test } from 'vitest'
import {
  isAirQualityMapSample,
  isWeatherMapSample
} from '../src/schemas/cachePayloads'
import { readValidatedCacheRecords } from '../src/services/cacheValidation'
import {
  invalidAirQualityMapSampleFixture,
  invalidWeatherMapSampleFixture,
  validAirQualityMapSampleFixture,
  validWeatherMapSampleFixture
} from './fixtures/cachePayloads'

describe('cached payload contracts', () => {
  test('validates weather map sample fixtures', () => {
    expect(isWeatherMapSample(validWeatherMapSampleFixture)).toBe(true)
    expect(isWeatherMapSample(invalidWeatherMapSampleFixture)).toBe(false)
  })

  test('validates air-quality map sample fixtures', () => {
    expect(isAirQualityMapSample(validAirQualityMapSampleFixture)).toBe(true)
    expect(isAirQualityMapSample(invalidAirQualityMapSampleFixture)).toBe(false)
  })

  test('rejects invalid cached payloads during hydration', () => {
    const hydrated = readValidatedCacheRecords(
      JSON.stringify({
        valid: {
          updatedAt: 1_700_000_000_000,
          payload: validWeatherMapSampleFixture
        },
        invalidPayload: {
          updatedAt: 1_700_000_000_000,
          payload: invalidWeatherMapSampleFixture
        },
        invalidTimestamp: {
          updatedAt: 'yesterday',
          payload: validWeatherMapSampleFixture
        }
      }),
      isWeatherMapSample
    )

    expect(Object.keys(hydrated)).toEqual(['valid'])
  })

  test('rejects malformed cache data during hydration', () => {
    expect(readValidatedCacheRecords('{', isWeatherMapSample)).toEqual({})
    expect(readValidatedCacheRecords('[]', isWeatherMapSample)).toEqual({})
  })
})
