import L from 'leaflet'
import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { WeatherMapAnimation } from '../map/WeatherMapAnimation'
import { WeatherRadarLayer } from '../map/WeatherRadarLayer'
import { interpolateWeatherAt } from '../services/weatherGrid'
import { interpolateAirQualityAt } from '../services/airQuality'
import { interpolateJetStreamAt } from '../services/jetStream'
import {
  REDUCED_MOTION_QUERY,
  prefersReducedMotion
} from '../utils/motion'
import { renderWeatherBadge } from '../map/weatherBadge'
import type {
  AirQualityMapSample,
  JetStreamSample,
  MapWeatherPointer,
  WeatherLocation,
  WeatherMapSample,
  WeatherMode,
  WeatherViewport
} from '../types/weather'

const WORLD_BOUNDS = L.latLngBounds(
  [-85.05112878, -180],
  [85.05112878, 180]
)
const MAP_TILE_STYLE_KEY = 'aether:map-tile-style'
const FIRE_LAYER_DESCRIPTION = [
  'Satellite heat detections from the last 24 hours.',
  'They may include extinguished fires or other hot sources,',
  'and clouds can hide active fires.'
].join(' ')

type MapTileStyle = 'standard' | 'dark'

type AetherMapProps = {
  location: WeatherLocation
  mode: WeatherMode
  samples: WeatherMapSample[]
  jetStreamSamples: JetStreamSample[]
  airQualitySamples: AirQualityMapSample[]
  radarOpacity: number
  onViewportChange: (viewport: WeatherViewport) => void
  onPointerWeatherChange: (reading: MapWeatherPointer | null) => void
  onMapClick: (location: WeatherLocation) => void
}

export function AetherMap({
  location,
  mode,
  samples,
  jetStreamSamples,
  airQualitySamples,
  radarOpacity,
  onViewportChange,
  onPointerWeatherChange,
  onMapClick
}: AetherMapProps) {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const initialLocationRef = useRef(location)
  const locationRef = useRef(location)
  const mapRef = useRef<L.Map | null>(null)
  const badgeLayerRef = useRef<L.LayerGroup | null>(null)
  const animationRef = useRef<WeatherMapAnimation | null>(null)
  const radarRef = useRef<WeatherRadarLayer | null>(null)
  const samplesRef = useRef(samples)
  const jetStreamSamplesRef = useRef(jetStreamSamples)
  const airQualitySamplesRef = useRef(airQualitySamples)
  const pointerCallbackRef = useRef(onPointerWeatherChange)
  const clickCallbackRef = useRef(onMapClick)
  const clickedLatRef = useRef(0)
  const clickedLngRef = useRef(0)
  const pointerRefreshRef = useRef<() => void>(() => {})
  const lastPointerRef = useRef<{
    latitude: number
    longitude: number
    x: number
    y: number
  } | null>(null)
  const frameRef = useRef(0)
  const pointerFrameRef = useRef(0)

  useEffect(() => {
    locationRef.current = location
  }, [location])

  useEffect(() => {
    samplesRef.current = samples
    pointerRefreshRef.current()
  }, [samples])

  useEffect(() => {
    jetStreamSamplesRef.current = jetStreamSamples
    pointerRefreshRef.current()
  }, [jetStreamSamples])

  useEffect(() => {
    airQualitySamplesRef.current = airQualitySamples
    pointerRefreshRef.current()
  }, [airQualitySamples])

  useEffect(() => {
    pointerCallbackRef.current = onPointerWeatherChange
    clickCallbackRef.current = onMapClick
  }, [onPointerWeatherChange, onMapClick])

  useEffect(() => {
    if (!elementRef.current || mapRef.current) {
      return
    }

    const initialLocation = initialLocationRef.current
    const reducedMotion = prefersReducedMotion()
    const motionQuery = window.matchMedia(REDUCED_MOTION_QUERY)
    const map = L.map(elementRef.current, {
      center: [initialLocation.latitude, initialLocation.longitude],
      fadeAnimation: !reducedMotion,
      inertia: !reducedMotion,
      zoom: 10,
      zoomAnimation: !reducedMotion,
      markerZoomAnimation: !reducedMotion,
      zoomControl: true,
      keyboard: true,
      keyboardPanDelta: 80,
      maxBounds: WORLD_BOUNDS,
      maxBoundsViscosity: 1,
      worldCopyJump: false
    })

    const standardTiles = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        noWrap: true,
        attribution: '&copy; OpenStreetMap contributors'
      }
    )
    const darkTiles = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        subdomains: 'abcd',
        maxZoom: 20,
        noWrap: true,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
      }
    )
    const tileStyle = loadMapTileStyle()
    const initialTiles = tileStyle === 'dark' ? darkTiles : standardTiles
    const fireTiles = L.tileLayer(
      '/api/fire-tile?z={z}&x={x}&y={y}',
      {
        maxNativeZoom: 12,
        maxZoom: 19,
        noWrap: true,
        opacity: 0.9,
        attribution: 'Heat detections NASA FIRMS'
      }
    )

    initialTiles.addTo(map)

    const tileControl = L.control.layers(
      {
        Standard: standardTiles,
        Dark: darkTiles
      },
      {
        'Heat detections · 24h': fireTiles
      },
      {
        collapsed: true,
        position: 'topright'
      }
    ).addTo(map)
    const fireLayerInput = tileControl.getContainer()?.querySelector(
      'input.leaflet-control-layers-selector[type="checkbox"]'
    )
    const fireLayerLabel = fireLayerInput?.closest('label')

    fireLayerLabel?.setAttribute('title', FIRE_LAYER_DESCRIPTION)
    fireLayerInput?.setAttribute(
      'aria-label',
      `Heat detections from the last 24 hours. ${FIRE_LAYER_DESCRIPTION}`
    )
    const handleTileStyleChange = (event: L.LayersControlEvent) => {
      saveMapTileStyle(event.name === 'Dark' ? 'dark' : 'standard')
    }

    map.on('baselayerchange', handleTileStyleChange)
    map.attributionControl.addAttribution(
      'Weather <a href="https://open-meteo.com/" target="_blank">Open-Meteo</a> · Air quality <a href="https://atmosphere.copernicus.eu/" target="_blank">CAMS</a> · Heat detections <a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank">NASA FIRMS</a>'
    )
    badgeLayerRef.current = L.layerGroup().addTo(map)
    const animation = new WeatherMapAnimation(map, elementRef.current)
    animation.start()
    animationRef.current = animation
    const radar = new WeatherRadarLayer(map)
    radar.start()
    radarRef.current = radar

    const emitViewport = () => {
      const bounds = map.getBounds()

      onViewportChange({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
        zoom: map.getZoom(),
        width: map.getSize().x,
        height: map.getSize().y
      })
    }
    const scheduleViewport = () => {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = window.requestAnimationFrame(emitViewport)
    }
    let pointerWeatherBlocked = false
    const emitPointerWeather = () => {
      const pointer = lastPointerRef.current

      if (pointerWeatherBlocked || !pointer) {
        pointerCallbackRef.current(null)
        return
      }

      const reading = interpolateWeatherAt(
        pointer.latitude,
        pointer.longitude,
        samplesRef.current
      )

      if (!reading) {
        pointerCallbackRef.current(null)
        return
      }

      const size = map.getSize()
      const airQuality = interpolateAirQualityAt(
        pointer.latitude,
        pointer.longitude,
        airQualitySamplesRef.current
      )
      const jetStream = interpolateJetStreamAt(
        pointer.latitude,
        pointer.longitude,
        jetStreamSamplesRef.current
      )

      pointerCallbackRef.current({
        ...reading,
        ...(jetStream ?? {}),
        ...(airQuality ?? {}),
        screenX: Math.max(12, Math.min(pointer.x + 16, size.x - 206)),
        screenY: Math.max(12, Math.min(pointer.y + 16, size.y - 206))
      })
    }
    const handleMouseMove = (event: L.LeafletMouseEvent) => {
      lastPointerRef.current = {
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
        x: event.containerPoint.x,
        y: event.containerPoint.y
      }
      window.cancelAnimationFrame(pointerFrameRef.current)
      pointerFrameRef.current = window.requestAnimationFrame(emitPointerWeather)
    }
    const clearPointerWeather = () => {
      window.cancelAnimationFrame(pointerFrameRef.current)
      lastPointerRef.current = null
      pointerCallbackRef.current(null)
    }
    const pointerBlockingControls = [
      tileControl.getContainer(),
      map.zoomControl.getContainer()
    ]
    const blockPointerWeather = () => {
      pointerWeatherBlocked = true
      clearPointerWeather()
    }
    const unblockPointerWeather = () => {
      pointerWeatherBlocked = false
    }

    for (const control of pointerBlockingControls) {
      control?.addEventListener('mouseenter', blockPointerWeather)
      control?.addEventListener('mouseleave', unblockPointerWeather)
    }

    const handleMapClick = (event: L.LeafletMouseEvent) => {
      clickedLatRef.current = event.latlng.lat
      clickedLngRef.current = event.latlng.lng
      clickCallbackRef.current({
        label: `${event.latlng.lat.toFixed(3)}, ${event.latlng.lng.toFixed(3)}`,
        latitude: event.latlng.lat,
        longitude: event.latlng.lng
      })
    }
    pointerRefreshRef.current = emitPointerWeather
    const handleWindowResize = () => {
      map.invalidateSize()
      animation.invalidate()
      scheduleViewport()
    }
    const handleMotionPreferenceChange = (event: MediaQueryListEvent) => {
      map.options.fadeAnimation = !event.matches
      map.options.inertia = !event.matches
      map.options.zoomAnimation = !event.matches
      map.options.markerZoomAnimation = !event.matches

      if (event.matches) {
        map.stop()
      }
    }
    map.on('moveend zoomend resize', scheduleViewport)
    map.on('moveend zoomend resize', animation.invalidate, animation)
    map.on('mousemove', handleMouseMove)
    map.on('click', handleMapClick)
    map.on('movestart zoomstart', clearPointerWeather)
    elementRef.current.addEventListener('mouseleave', clearPointerWeather)
    window.addEventListener('resize', handleWindowResize)
    motionQuery.addEventListener('change', handleMotionPreferenceChange)
    emitViewport()
    mapRef.current = map

    return () => {
      window.cancelAnimationFrame(frameRef.current)
      window.cancelAnimationFrame(pointerFrameRef.current)
      window.removeEventListener('resize', handleWindowResize)
      motionQuery.removeEventListener('change', handleMotionPreferenceChange)
      for (const control of pointerBlockingControls) {
        control?.removeEventListener('mouseenter', blockPointerWeather)
        control?.removeEventListener('mouseleave', unblockPointerWeather)
      }
      map.off('moveend zoomend resize', scheduleViewport)
      map.off('moveend zoomend resize', animation.invalidate, animation)
      map.off('mousemove', handleMouseMove)
      map.off('click', handleMapClick)
      map.off('baselayerchange', handleTileStyleChange)
      map.off('movestart zoomstart', clearPointerWeather)
      elementRef.current?.removeEventListener('mouseleave', clearPointerWeather)
      pointerRefreshRef.current = () => {}
      pointerCallbackRef.current(null)
      animation.destroy()
      radar.destroy()
      tileControl.remove()
      map.remove()
      mapRef.current = null
      badgeLayerRef.current = null
      animationRef.current = null
      radarRef.current = null
    }
  }, [onViewportChange])

  useEffect(() => {
    const map = mapRef.current

    if (!map) {
      return
    }

    const nextCenter: L.LatLngExpression = [location.latitude, location.longitude]
    const currentCenter = map.getCenter()
    if (
      Math.abs(clickedLatRef.current - location.latitude) < 0.0001 &&
      Math.abs(clickedLngRef.current - location.longitude) < 0.0001
    ) {
      return
    }

    const latDelta = Math.abs(currentCenter.lat - location.latitude)
    const lngDelta = Math.abs(currentCenter.lng - location.longitude)

    if (latDelta < 0.1 && lngDelta < 0.1) {
      return
    }

    const nextZoom = Math.max(map.getZoom(), 10)

    if (prefersReducedMotion()) {
      map.setView(nextCenter, nextZoom, { animate: false })
    } else {
      map.flyTo(nextCenter, nextZoom, {
        animate: true,
        duration: 1.1
      })
    }
  }, [location])

  useEffect(() => {
    const badgeLayer = badgeLayerRef.current

    if (!badgeLayer) {
      return
    }

    badgeLayer.clearLayers()

    if (mode === 'air-quality' || mode === 'jet-stream') {
      return
    }

    for (const sample of samples.filter(sample => sample.showBadge !== false)) {
      const marker = L.marker([sample.latitude, sample.longitude], {
        interactive: false,
        icon: L.divIcon({
          className: 'weather-badge-marker',
          html: renderWeatherBadge(sample, mode),
          iconSize: [112, 46],
          iconAnchor: [-8, 36]
        })
      })

      marker.addTo(badgeLayer)
    }
  }, [samples, mode])

  useEffect(() => {
    animationRef.current?.setData(
      samples,
      mode,
      airQualitySamples,
      jetStreamSamples
    )
    radarRef.current?.setMode(mode)
    radarRef.current?.setOpacity(radarOpacity)
  }, [airQualitySamples, jetStreamSamples, samples, mode, radarOpacity])

  function handleMapKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const map = mapRef.current

    if (!map || event.target !== event.currentTarget) {
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()

      const center = map.getCenter()

      clickCallbackRef.current({
        label: `${center.lat.toFixed(3)}, ${center.lng.toFixed(3)}`,
        latitude: center.lat,
        longitude: center.lng
      })
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()

      const selectedLocation = locationRef.current

      map.panTo(
        [selectedLocation.latitude, selectedLocation.longitude],
        { animate: !prefersReducedMotion() }
      )
    }
  }

  return (
    <>
      <div
        ref={elementRef}
        className="aether-map"
        role="region"
        tabIndex={0}
        aria-label={`Interactive weather map for ${location.label}`}
        aria-describedby="map-keyboard-instructions"
        onKeyDown={handleMapKeyDown}
      />
      <p id="map-keyboard-instructions" className="visually-hidden">
        Use arrow keys to pan, plus and minus to zoom, Enter to select the
        center of the map, and Home to return to the selected location.
      </p>
    </>
  )
}

function loadMapTileStyle(): MapTileStyle {
  try {
    return window.localStorage.getItem(MAP_TILE_STYLE_KEY) === 'dark'
      ? 'dark'
      : 'standard'
  } catch {
    return 'standard'
  }
}

function saveMapTileStyle(style: MapTileStyle) {
  try {
    window.localStorage.setItem(MAP_TILE_STYLE_KEY, style)
  } catch {
    return
  }
}
