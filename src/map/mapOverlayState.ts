import type { FireLayerId } from './fireLayerStatus'

const MAP_OVERLAYS_KEY = 'aether:map-overlays:v2'

export type MapOverlayId = FireLayerId | 'volcano-activity' | 'seismic-activity'

export const MAP_OVERLAY_IDS: MapOverlayId[] = [
  'volcano-activity',
  'seismic-activity',
  'heat-detections',
  'reported-wildfires',
  'africa-detections',
  'europe-detections'
]

type OverlayStorage = Pick<Storage, 'getItem' | 'setItem'>

export function loadEnabledMapOverlays(
  storage: OverlayStorage = window.localStorage
) {
  try {
    const value = storage.getItem(MAP_OVERLAYS_KEY)

    if (value === null) {
      return defaultOverlays()
    }

    const parsed: unknown = JSON.parse(value)

    if (!Array.isArray(parsed)) {
      return new Set<MapOverlayId>()
    }

    return new Set(
      MAP_OVERLAY_IDS.filter(layerId => parsed.includes(layerId))
    )
  } catch {
    return defaultOverlays()
  }
}

function defaultOverlays() {
  return new Set<MapOverlayId>(['volcano-activity', 'seismic-activity'])
}

export function saveEnabledMapOverlays<Layer>(
  map: { hasLayer: (layer: Layer) => boolean },
  layers: Record<MapOverlayId, Layer>,
  storage: OverlayStorage = window.localStorage
) {
  try {
    const enabled = MAP_OVERLAY_IDS.filter(layerId => (
      map.hasLayer(layers[layerId])
    ))

    storage.setItem(MAP_OVERLAYS_KEY, JSON.stringify(enabled))
  } catch {
    return
  }
}
