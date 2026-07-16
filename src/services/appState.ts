import { defaultCity } from '../data/cityCatalog'
import type {
  AnimationQuality,
  WeatherLocation,
  WeatherMode
} from '../types/weather'

const STORED_LOCATION_KEY = 'aether:location'
const RADAR_OPACITY_KEY = 'aether:radar-opacity'
const ANIMATION_QUALITY_KEY = 'aether:animation-quality'
const WEATHER_PANEL_COLLAPSED_KEY = 'aether:weather-panel-collapsed'
const ANIMATION_QUALITIES: readonly AnimationQuality[] = [
  'low',
  'balanced',
  'high'
]
const WEATHER_MODES: readonly WeatherMode[] = [
  'temperature',
  'temperature-anomaly',
  'wind',
  'jet-stream',
  'precipitation',
  'storm',
  'air-quality',
  'ocean-current'
]

export function loadInitialLocation() {
  return readUrlLocation() ?? loadStoredLocation() ?? defaultCity
}

export function readUrlMode(): WeatherMode {
  try {
    const raw = new URLSearchParams(window.location.search).get('mode')

    return raw && WEATHER_MODES.includes(raw as WeatherMode)
      ? raw as WeatherMode
      : 'temperature'
  } catch {
    return 'temperature'
  }
}

export function persistLocation(location: WeatherLocation) {
  try {
    window.localStorage.setItem(STORED_LOCATION_KEY, JSON.stringify(location))
  } catch {
    return
  }
}

export function updateUrlLocation(location: WeatherLocation, mode: WeatherMode) {
  try {
    const params = new URLSearchParams(window.location.search)
    const coordinates = `${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`

    if (params.get('coords') === coordinates && params.get('mode') === mode) {
      return
    }

    params.set('coords', coordinates)
    params.set('mode', mode)
    window.history.replaceState(null, '', `?${params}`)
  } catch {
    return
  }
}

export function loadRadarOpacity() {
  try {
    const opacity = Number(
      window.localStorage.getItem(RADAR_OPACITY_KEY) ?? 0.58
    )

    return Number.isFinite(opacity) && opacity >= 0 && opacity <= 1
      ? opacity
      : 0.58
  } catch {
    return 0.58
  }
}

export function persistRadarOpacity(opacity: number) {
  try {
    window.localStorage.setItem(RADAR_OPACITY_KEY, String(opacity))
  } catch {
    return
  }
}

export function loadAnimationQuality(): AnimationQuality {
  try {
    const quality = window.localStorage.getItem(ANIMATION_QUALITY_KEY)

    return ANIMATION_QUALITIES.includes(quality as AnimationQuality)
      ? quality as AnimationQuality
      : 'balanced'
  } catch {
    return 'balanced'
  }
}

export function persistAnimationQuality(quality: AnimationQuality) {
  try {
    window.localStorage.setItem(ANIMATION_QUALITY_KEY, quality)
  } catch {
    return
  }
}

export function loadWeatherPanelCollapsed() {
  try {
    return window.localStorage.getItem(WEATHER_PANEL_COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

export function persistWeatherPanelCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(
      WEATHER_PANEL_COLLAPSED_KEY,
      String(collapsed)
    )
  } catch {
    return
  }
}

function loadStoredLocation(): WeatherLocation | null {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STORED_LOCATION_KEY) ?? 'null'
    ) as WeatherLocation | null

    return (
      parsed &&
      typeof parsed.latitude === 'number' &&
      typeof parsed.longitude === 'number' &&
      typeof parsed.label === 'string'
    ) ? parsed : null
  } catch {
    return null
  }
}

function readUrlLocation(): WeatherLocation | null {
  const raw = new URLSearchParams(window.location.search).get('coords')
  const parts = raw?.split(',')

  if (parts?.length !== 2) {
    return null
  }

  const latitude = Number(parts[0])
  const longitude = Number(parts[1])

  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? {
        latitude,
        longitude,
        label: `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`
      }
    : null
}
