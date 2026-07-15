import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  buildFireTileUrl,
  parseFireTileCoordinates
} from '../server/fireTile.js'
import {
  buildEffisTileUrl,
  parseEffisTileCoordinates
} from '../server/effisTile.js'
import { getReportedFires } from '../server/reportedFires.js'

describe('fire tile coordinates', () => {
  test('converts a valid FIRMS tile to its Web Mercator bounding box', () => {
    const tile = parseFireTileCoordinates('1', '1', '1')
    const url = new URL(buildFireTileUrl('map-key', tile))
    const bounds = url.searchParams.get('BBOX').split(',').map(Number)

    expect(tile).toEqual({ z: 1, x: 1, y: 1 })
    expect(bounds[0]).toBeCloseTo(0)
    expect(bounds[1]).toBeCloseTo(-20037508.342789244)
    expect(bounds[2]).toBeCloseTo(20037508.342789244)
    expect(bounds[3]).toBeCloseTo(0)
  })

  test('rejects out-of-range and non-integer tile coordinates', () => {
    expect(parseFireTileCoordinates('13', '0', '0')).toBeNull()
    expect(parseFireTileCoordinates('2', '4', '0')).toBeNull()
    expect(parseEffisTileCoordinates('2', '1.5', '1')).toBeNull()
  })

  test('converts an EFFIS tile to geographic bounds', () => {
    const tile = parseEffisTileCoordinates('1', '1', '1')
    const url = new URL(buildEffisTileUrl(tile))
    const bounds = url.searchParams.get('BBOX').split(',').map(Number)

    expect(bounds[0]).toBeCloseTo(0)
    expect(bounds[1]).toBeCloseTo(-85.05112878)
    expect(bounds[2]).toBeCloseTo(180)
    expect(bounds[3]).toBeCloseTo(0)
  })
})

describe('EFFIS date window', () => {
  test('requests today and yesterday in UTC across a year boundary', () => {
    const tile = { z: 2, x: 2, y: 1 }
    const now = new Date('2026-01-01T00:05:00-08:00')
    const url = new URL(buildEffisTileUrl(tile, now))

    expect(url.searchParams.get('TIME')).toBe('2025-12-31/2026-01-01')
  })
})

describe('reported fire filtering and deduplication', () => {
  afterEach(() => vi.unstubAllGlobals())

  test('filters prescribed EONET events and deduplicates by incident ID', async () => {
    const fetchMock = vi.fn(async value => {
      const url = String(value)

      if (url.includes('WFIGS_Incident')) {
        return jsonResponse(featureCollection([
          pointFeature(10, 20, {
            IrwinID: 'nifc-1',
            IncidentName: 'Pine Fire',
            IncidentTypeCategory: 'WF'
          }),
          pointFeature(11, 21, {
            IrwinID: 'nifc-1',
            IncidentName: 'Pine Fire duplicate',
            IncidentTypeCategory: 'WF'
          })
        ]))
      }

      if (url.includes('cwfif_national_activefires')) {
        return jsonResponse(featureCollection([
          pointFeature(10.0004, 20.0004, {
            national_fire_id: 'cwfis-1',
            fire_was_prescribed: 0,
            stage_of_control_status: 'OC'
          })
        ]))
      }

      return jsonResponse(featureCollection([
        pointFeature(30, 40, {
          id: 'EONET_1',
          title: 'Cedar Wildfire',
          date: '2026-07-15T00:00:00Z'
        }),
        pointFeature(31, 41, {
          id: 'EONET_2',
          title: 'Cedar Prescribed Fire',
          date: '2026-07-15T00:00:00Z'
        })
      ]))
    })

    vi.stubGlobal('fetch', fetchMock)

    const fires = await getReportedFires()
    const eonetCall = fetchMock.mock.calls.find(([url]) => (
      String(url).includes('eonet.gsfc.nasa.gov')
    ))

    expect(eonetCall[0]).toContain('category=wildfires')
    expect(eonetCall[0]).toContain('status=open')
    expect(fires.map(fire => fire.id)).toEqual([
      'nifc:nifc-1',
      'cwfis:cwfis-1',
      'eonet:EONET_1'
    ])
  })
})

function featureCollection(features) {
  return { type: 'FeatureCollection', features }
}

function pointFeature(longitude, latitude, properties) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [longitude, latitude] },
    properties
  }
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}
