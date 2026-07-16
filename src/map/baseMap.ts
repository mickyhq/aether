import L from 'leaflet'
import '@maplibre/maplibre-gl-leaflet'
import type { Map as MapLibreMap } from 'maplibre-gl'

const DEFAULT_BASE_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
const DEFAULT_BASE_MAP_ATTRIBUTION = [
  'OpenFreeMap',
  '&copy; OpenMapTiles',
  'Data from OpenStreetMap'
].join(' · ')
const BASE_MAP_STYLE_URL = readStyleUrl(
  import.meta.env.VITE_BASE_MAP_STYLE_URL
)
const BASE_MAP_ATTRIBUTION =
  import.meta.env.VITE_BASE_MAP_ATTRIBUTION?.trim() ||
  DEFAULT_BASE_MAP_ATTRIBUTION

export const MAP_LABEL_LANGUAGE = 'en'

export function addBaseMap(
  map: L.Map,
  language = MAP_LABEL_LANGUAGE
) {
  let currentLanguage = language
  const layer = L.maplibreGL({
    style: BASE_MAP_STYLE_URL,
    attributionControl: {
      customAttribution: BASE_MAP_ATTRIBUTION
    }
  }).addTo(map)
  const vectorMap = layer.getMaplibreMap()
  const container = layer.getContainer()

  container.style.opacity = '0'
  vectorMap.once('style.load', () => {
    localizeMapLabels(vectorMap, currentLanguage)
    container.style.opacity = '1'
  })

  return {
    layer,
    setLanguage: (nextLanguage: string) => {
      currentLanguage = nextLanguage

      if (vectorMap.isStyleLoaded()) {
        localizeMapLabels(vectorMap, currentLanguage)
      }
    }
  }
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

function readStyleUrl(value: string | undefined) {
  if (!value?.trim()) {
    return DEFAULT_BASE_MAP_STYLE_URL
  }

  try {
    const url = new URL(value.trim(), window.location.origin)

    if (url.protocol === 'https:' || url.origin === window.location.origin) {
      return url.toString()
    }
  } catch {
    return DEFAULT_BASE_MAP_STYLE_URL
  }

  return DEFAULT_BASE_MAP_STYLE_URL
}
