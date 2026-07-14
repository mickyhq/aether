import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { FireLayerStatus } from './FireLayerStatus'
import { WeatherMapAnimation } from '../map/WeatherMapAnimation'
import { WeatherRadarLayer } from '../map/WeatherRadarLayer'
import { ReportedFireLayer } from '../map/ReportedFireLayer'
import { findFireTileAtPoint } from '../map/fireTileHitTest'
import { AnimatedFireTileLayer } from '../map/AnimatedFireTileLayer'
import {
  INITIAL_FIRE_LAYER_STATUSES
} from '../map/fireLayerStatus'
import type {
  FireLayerId,
  FireLayerStatusPatch
} from '../map/fireLayerStatus'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
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
  MapFirePointer,
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
const AMERICAS_FIRE_BOUNDS = L.latLngBounds([-60, -170], [85, -30])
const AFRICA_FIRE_BOUNDS = L.latLngBounds([-35, -20], [40, 55])
const EUROPE_FIRE_BOUNDS = L.latLngBounds([40, -25], [72, 45])
const MAP_TILE_STYLE_KEY = 'aether:map-tile-style'
const MAP_OVERLAYS_KEY = 'aether:map-overlays'
const MAP_OVERLAY_IDS: FireLayerId[] = [
  'heat-detections',
  'reported-wildfires',
  'africa-detections',
  'europe-detections'
]
const FIRE_LAYER_DESCRIPTION = [
  'Satellite heat detections from the last 24 hours.',
  'They may include extinguished fires or other hot sources,',
  'and clouds can hide active fires.'
].join(' ')
const FIRMS_HOVER_INFO: MapFirePointer = {
  title: 'Americas heat detection',
  source: 'NASA FIRMS · VIIRS',
  detail: 'Detected within the last 24 hours. Not a confirmed active fire.'
}
const AFRICA_EFFIS_HOVER_INFO: MapFirePointer = {
  title: 'Africa heat detection',
  source: 'Copernicus EFFIS · VIIRS',
  detail: 'Detected today or yesterday. Not a confirmed active fire.'
}
const EUROPE_EFFIS_HOVER_INFO: MapFirePointer = {
  title: 'Europe heat detection',
  source: 'Copernicus EFFIS · VIIRS',
  detail: 'Detected today or yesterday. Not a confirmed active fire.'
}

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
  const reportedFireHoverRef = useRef<MapFirePointer | null>(null)
  const [fireLayerStatuses, setFireLayerStatuses] = useState(
    INITIAL_FIRE_LAYER_STATUSES
  )

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
    const updateFireLayerStatus = (
      id: FireLayerId,
      patch: FireLayerStatusPatch
    ) => {
      setFireLayerStatuses(current => current.map(status => (
        status.id === id ? { ...status, ...patch } : status
      )))
    }
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
      attributionControl: false,
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
    const reportedFires = new ReportedFireLayer(
      map,
      status => updateFireLayerStatus('reported-wildfires', status),
      fire => {
        reportedFireHoverRef.current = fire
        pointerRefreshRef.current()
      }
    )
    reportedFires.setExcludedBounds(AMERICAS_FIRE_BOUNDS)
    const fireTiles = new AnimatedFireTileLayer(
      '/api/fire-tile?z={z}&x={x}&y={y}',
      {
        bounds: AMERICAS_FIRE_BOUNDS,
        detectionBounds: AMERICAS_FIRE_BOUNDS,
        maxNativeZoom: 12,
        maxZoom: 19,
        noWrap: true,
        opacity: 0.9,
        attribution: 'Americas heat detections NASA FIRMS'
      }
    )
    const africaFireTiles = new AnimatedFireTileLayer(
      '/api/effis-fire-tile?z={z}&x={x}&y={y}',
      {
        bounds: AFRICA_FIRE_BOUNDS,
        detectionBounds: AFRICA_FIRE_BOUNDS,
        maxNativeZoom: 12,
        maxZoom: 19,
        noWrap: true,
        opacity: 0.92,
        attribution: 'African fire detections Copernicus EFFIS'
      }
    )
    const europeFireTiles = new AnimatedFireTileLayer(
      '/api/effis-fire-tile?z={z}&x={x}&y={y}',
      {
        bounds: EUROPE_FIRE_BOUNDS,
        detectionBounds: EUROPE_FIRE_BOUNDS,
        maxNativeZoom: 12,
        maxZoom: 19,
        noWrap: true,
        opacity: 0.92,
        useVisibilityBudget: false,
        attribution: 'European fire detections Copernicus EFFIS'
      }
    )
    const mapOverlayLayers: Record<FireLayerId, L.Layer> = {
      'heat-detections': fireTiles,
      'reported-wildfires': reportedFires.getLeafletLayer(),
      'africa-detections': africaFireTiles,
      'europe-detections': europeFireTiles
    }

    initialTiles.addTo(map)

    const tileControl = L.control.layers(
      {},
      {
        'Americas heat detections · 24h': fireTiles,
        'Africa fire detections · Today + yesterday': africaFireTiles,
        'Europe fire detections · Today + yesterday': europeFireTiles,
        'Reported open wildfires': reportedFires.getLeafletLayer()
      },
      {
        collapsed: true,
        position: 'topright'
      }
    ).addTo(map)
    const overlayInputs = Array.from(
      tileControl.getContainer()?.querySelectorAll<HTMLInputElement>(
        'input.leaflet-control-layers-selector[type="checkbox"]'
      ) ?? []
    )
    const heatLayerInput = overlayInputs[0]
    const africaFireInput = overlayInputs[1]
    const europeFireInput = overlayInputs[2]
    const reportedFireInput = overlayInputs[3]

    addLayerControlHeading(heatLayerInput, 'Satellite detections')
    addLayerControlHeading(reportedFireInput, 'Reported incidents')

    heatLayerInput?.closest('label')?.setAttribute(
      'title',
      FIRE_LAYER_DESCRIPTION
    )
    heatLayerInput?.setAttribute(
      'aria-label',
      `Americas heat detections from the last 24 hours. ${FIRE_LAYER_DESCRIPTION}`
    )
    reportedFireInput?.closest('label')?.setAttribute(
      'title',
      'Open wildfire incidents from NIFC in the USA, CWFIS in Canada, and NASA EONET elsewhere. Coverage is incomplete and status can lag.'
    )
    reportedFireInput?.setAttribute(
      'aria-label',
      'Reported open wildfires from NIFC, CWFIS, and NASA EONET. Americas incidents follow the Americas heat-detection toggle. Coverage is incomplete and status can lag.'
    )
    africaFireInput?.closest('label')?.setAttribute(
      'title',
      'Copernicus EFFIS filtered VIIRS detections from today and yesterday across Africa. These are not confirmed incident reports.'
    )
    africaFireInput?.setAttribute(
      'aria-label',
      'Copernicus Africa fire detections from today and yesterday. These are not confirmed incident reports.'
    )
    europeFireInput?.closest('label')?.setAttribute(
      'title',
      'Copernicus EFFIS filtered VIIRS detections from today and yesterday across Europe. These are not confirmed incident reports.'
    )
    europeFireInput?.setAttribute(
      'aria-label',
      'Copernicus Europe fire detections from today and yesterday. These are not confirmed incident reports.'
    )
    let firmsConfigured: boolean | null = null
    let firmsLoadedTiles = 0
    let africaLoadedTiles = 0
    let europeLoadedTiles = 0
    const fireStatusController = new AbortController()
    const handleFireOverlayAdd = (event: L.LayersControlEvent) => {
      if (event.layer === fireTiles) {
        reportedFires.setExcludedBounds(null)
        updateFireLayerStatus('heat-detections', {
          enabled: true,
          state: firmsConfigured === false ? 'missing-key' : 'loading'
        })
      } else if (event.layer === reportedFires.getLeafletLayer()) {
        updateFireLayerStatus('reported-wildfires', {
          enabled: true,
          state: 'loading'
        })
      } else if (event.layer === africaFireTiles) {
        updateFireLayerStatus('africa-detections', {
          enabled: true,
          state: 'loading'
        })
      } else if (event.layer === europeFireTiles) {
        updateFireLayerStatus('europe-detections', {
          enabled: true,
          state: 'loading'
        })
      }

      if (getFireLayerId(
        event.layer,
        fireTiles,
        reportedFires.getLeafletLayer(),
        africaFireTiles,
        europeFireTiles
      )) {
        saveEnabledMapOverlays(map, mapOverlayLayers)
      }
    }
    const handleFireOverlayRemove = (event: L.LayersControlEvent) => {
      if (event.layer === fireTiles) {
        reportedFires.setExcludedBounds(AMERICAS_FIRE_BOUNDS)
      }

      const layerId = getFireLayerId(
        event.layer,
        fireTiles,
        reportedFires.getLeafletLayer(),
        africaFireTiles,
        europeFireTiles
      )

      if (layerId) {
        updateFireLayerStatus(layerId, { enabled: false, state: 'idle' })
        saveEnabledMapOverlays(map, mapOverlayLayers)
      }
    }
    const handleFirmsLoading = () => {
      firmsLoadedTiles = 0

      if (map.hasLayer(fireTiles)) {
        updateFireLayerStatus('heat-detections', {
          state: firmsConfigured === false ? 'missing-key' : 'loading'
        })
      }
    }
    const handleFirmsTileLoad = () => {
      firmsLoadedTiles += 1
    }
    const handleFirmsLoad = () => {
      if (!map.hasLayer(fireTiles)) {
        return
      }

      updateFireLayerStatus('heat-detections', {
        state: firmsConfigured === false
          ? 'missing-key'
          : firmsLoadedTiles > 0 ? 'available' : 'unavailable',
        ...(firmsLoadedTiles > 0 ? { lastUpdated: Date.now() } : {})
      })
    }
    const handleAfricaLoading = () => {
      africaLoadedTiles = 0

      if (map.hasLayer(africaFireTiles)) {
        updateFireLayerStatus('africa-detections', { state: 'loading' })
      }
    }
    const handleAfricaTileLoad = () => {
      africaLoadedTiles += 1
    }
    const handleAfricaLoad = () => {
      if (!map.hasLayer(africaFireTiles)) {
        return
      }

      updateFireLayerStatus('africa-detections', {
        state: africaLoadedTiles > 0 ? 'available' : 'unavailable',
        ...(africaLoadedTiles > 0 ? { lastUpdated: Date.now() } : {})
      })
    }
    const handleEuropeLoading = () => {
      europeLoadedTiles = 0

      if (map.hasLayer(europeFireTiles)) {
        updateFireLayerStatus('europe-detections', { state: 'loading' })
      }
    }
    const handleEuropeTileLoad = () => {
      europeLoadedTiles += 1
    }
    const handleEuropeLoad = () => {
      if (!map.hasLayer(europeFireTiles)) {
        return
      }

      updateFireLayerStatus('europe-detections', {
        state: europeLoadedTiles > 0 ? 'available' : 'unavailable',
        ...(europeLoadedTiles > 0 ? { lastUpdated: Date.now() } : {})
      })
    }

    map.on('overlayadd', handleFireOverlayAdd)
    map.on('overlayremove', handleFireOverlayRemove)
    fireTiles.on('loading', handleFirmsLoading)
    fireTiles.on('tileload', handleFirmsTileLoad)
    fireTiles.on('load', handleFirmsLoad)
    africaFireTiles.on('loading', handleAfricaLoading)
    africaFireTiles.on('tileload', handleAfricaTileLoad)
    africaFireTiles.on('load', handleAfricaLoad)
    europeFireTiles.on('loading', handleEuropeLoading)
    europeFireTiles.on('tileload', handleEuropeTileLoad)
    europeFireTiles.on('load', handleEuropeLoad)
    void fetchWithTimeout(
      '/api/fire-layer-status',
      { signal: fireStatusController.signal },
      5000
    ).then(async response => {
      if (!response.ok) {
        throw new Error('Fire layer status unavailable')
      }

      const payload = await response.json() as { firmsConfigured?: boolean }

      firmsConfigured = payload.firmsConfigured === true

      if (!firmsConfigured && map.hasLayer(fireTiles)) {
        updateFireLayerStatus('heat-detections', { state: 'missing-key' })
      }
    }).catch(() => {
      if (!fireStatusController.signal.aborted && map.hasLayer(fireTiles)) {
        updateFireLayerStatus('heat-detections', { state: 'unavailable' })
      }
    })
    badgeLayerRef.current = L.layerGroup().addTo(map)
    const animation = new WeatherMapAnimation(map, elementRef.current)
    animation.start()
    animationRef.current = animation
    const radar = new WeatherRadarLayer(map)
    radar.start()
    radarRef.current = radar
    reportedFires.start()

    for (const layerId of loadEnabledMapOverlays()) {
      mapOverlayLayers[layerId].addTo(map)
    }

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
      const fire = reportedFireHoverRef.current ?? findFireTileAtPoint(
        map,
        L.point(pointer.x, pointer.y),
        [
          { layer: africaFireTiles, info: AFRICA_EFFIS_HOVER_INFO },
          { layer: europeFireTiles, info: EUROPE_EFFIS_HOVER_INFO },
          { layer: fireTiles, info: FIRMS_HOVER_INFO }
        ]
      )

      pointerCallbackRef.current({
        ...reading,
        ...(jetStream ?? {}),
        ...(airQuality ?? {}),
        ...(fire ? { fire } : {}),
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
      reportedFireHoverRef.current = null
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
      fireStatusController.abort()
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
      map.off('overlayadd', handleFireOverlayAdd)
      map.off('overlayremove', handleFireOverlayRemove)
      fireTiles.off('loading', handleFirmsLoading)
      fireTiles.off('tileload', handleFirmsTileLoad)
      fireTiles.off('load', handleFirmsLoad)
      africaFireTiles.off('loading', handleAfricaLoading)
      africaFireTiles.off('tileload', handleAfricaTileLoad)
      africaFireTiles.off('load', handleAfricaLoad)
      europeFireTiles.off('loading', handleEuropeLoading)
      europeFireTiles.off('tileload', handleEuropeTileLoad)
      europeFireTiles.off('load', handleEuropeLoad)
      map.off('movestart zoomstart', clearPointerWeather)
      elementRef.current?.removeEventListener('mouseleave', clearPointerWeather)
      pointerRefreshRef.current = () => {}
      pointerCallbackRef.current(null)
      animation.destroy()
      radar.destroy()
      reportedFires.destroy()
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
      <FireLayerStatus statuses={fireLayerStatuses} />
    </>
  )
}

function getFireLayerId(
  layer: L.Layer,
  firmsLayer: L.Layer,
  reportedLayer: L.Layer,
  africaLayer: L.Layer,
  europeLayer: L.Layer
): FireLayerId | null {
  if (layer === firmsLayer) {
    return 'heat-detections'
  }

  if (layer === reportedLayer) {
    return 'reported-wildfires'
  }

  if (layer === africaLayer) {
    return 'africa-detections'
  }

  return layer === europeLayer ? 'europe-detections' : null
}

function addLayerControlHeading(
  input: HTMLInputElement | undefined,
  text: string
) {
  const label = input?.closest('label')

  if (!label) {
    return
  }

  const heading = document.createElement('div')

  heading.className = 'leaflet-control-layers-section-title'
  heading.setAttribute('role', 'heading')
  heading.setAttribute('aria-level', '3')
  heading.textContent = text
  label.before(heading)
}

function loadMapTileStyle(): MapTileStyle {
  try {
    const stored = window.localStorage.getItem(MAP_TILE_STYLE_KEY)

    return stored === 'standard' ? 'standard' : 'dark'
  } catch {
    return 'dark'
  }
}

function loadEnabledMapOverlays() {
  try {
    const value = window.localStorage.getItem(MAP_OVERLAYS_KEY)
    const parsed: unknown = value ? JSON.parse(value) : []

    if (!Array.isArray(parsed)) {
      return new Set<FireLayerId>()
    }

    return new Set(
      MAP_OVERLAY_IDS.filter(layerId => parsed.includes(layerId))
    )
  } catch {
    return new Set<FireLayerId>()
  }
}

function saveEnabledMapOverlays(
  map: L.Map,
  layers: Record<FireLayerId, L.Layer>
) {
  try {
    const enabled = MAP_OVERLAY_IDS.filter(layerId => (
      map.hasLayer(layers[layerId])
    ))

    window.localStorage.setItem(MAP_OVERLAYS_KEY, JSON.stringify(enabled))
  } catch {
    return
  }
}
