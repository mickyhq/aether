import L from 'leaflet'
import '@maplibre/maplibre-gl-leaflet'
import type { Map as MapLibreMap } from 'maplibre-gl'

const OPEN_FREE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron'

export const MAP_LABEL_LANGUAGE = 'en'

export function addBaseMap(
  map: L.Map,
  language = MAP_LABEL_LANGUAGE
) {
  const layer = L.maplibreGL({
    style: OPEN_FREE_MAP_STYLE,
    attributionControl: {
      customAttribution: [
        'OpenFreeMap',
        '&copy; OpenMapTiles',
        'Data from OpenStreetMap'
      ].join(' · ')
    }
  }).addTo(map)
  const vectorMap = layer.getMaplibreMap()
  const container = layer.getContainer()

  container.style.opacity = '0'
  vectorMap.once('style.load', () => {
    localizeMapLabels(vectorMap, language)
    container.style.opacity = '1'
  })

  return layer
}

export function localizeMapLabels(
  map: MapLibreMap,
  language: string
) {
  const languageField = `name_${normalizeLanguage(language)}`

  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== 'symbol') {
      continue
    }

    const textField = map.getLayoutProperty(layer.id, 'text-field')

    if (!containsNameField(textField)) {
      continue
    }

    map.setLayoutProperty(layer.id, 'text-field', [
      'coalesce',
      ['get', languageField],
      ['get', 'name:latin'],
      ['get', 'name']
    ])
  }
}

function containsNameField(value: unknown) {
  if (typeof value === 'string') {
    return value.includes('name')
  }

  return Array.isArray(value) && value.some(containsNameField)
}

function normalizeLanguage(language: string) {
  return language.trim().toLowerCase().replace(/-/g, '_') || 'en'
}
