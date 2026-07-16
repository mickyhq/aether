import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { FireLayerStatus } from './FireLayerStatus'
import {
  createAetherMapLayers
} from '../map/AetherMapLayers'
import type { AetherMapLayers } from '../map/AetherMapLayers'
import { WeatherMapAnimation } from '../map/WeatherMapAnimation'
import { OfficialWarningLayer } from '../map/OfficialWarningLayer'
import {
  INITIAL_FIRE_LAYER_STATUSES
} from '../map/fireLayerStatus'
import type {
  FireLayerId,
  FireLayerStatusPatch
} from '../map/fireLayerStatus'
import { interpolateWeatherAt } from '../services/weatherGrid'
import { interpolateAirQualityAt } from '../services/airQuality'
import { interpolateJetStreamAt } from '../services/jetStream'
import { interpolateOceanCurrentAt } from '../services/oceanCurrents'
import { interpolateTemperatureAnomalyAt } from '../services/temperatureAnomaly'
import {
  REDUCED_MOTION_QUERY,
  prefersReducedMotion
} from '../utils/motion'
import { renderWeatherBadge } from '../map/weatherBadge'
import type {
  AnimationQuality,
  AirQualityMapSample,
  JetStreamSample,
  OceanCurrentSample,
  TemperatureAnomalySample,
  MapWeatherPointer,
  OfficialWarning,
  WeatherLocation,
  WeatherMapSample,
  WeatherMode,
  WeatherModeProvenance,
  WeatherViewport
} from '../types/weather'
import { useI18n } from '../i18n/I18nContext'

const WORLD_BOUNDS = L.latLngBounds(
  [-85.05112878, -180],
  [85.05112878, 180]
)
const REGIONAL_VIEW_BOUNDS = L.latLngBounds(
  [34, -12],
  [72, 40]
)
const ABSOLUTE_MIN_ZOOM = 2
const MAP_POINTER_BLOCK_SELECTOR = [
  '.aether-header',
  '.fire-layer-status',
  '.leaflet-control',
  '.leaflet-marker-icon',
  '.leaflet-interactive',
  '.leaflet-popup',
  '.leaflet-tooltip',
  '.offline-status',
  '.radar-opacity-control',
  '.weather-panel',
  '.weather-panel-toggle'
].join(', ')

type AetherMapProps = {
  location: WeatherLocation
  mapLanguage: string
  mode: WeatherMode
  samples: WeatherMapSample[]
  jetStreamSamples: JetStreamSample[]
  airQualitySamples: AirQualityMapSample[]
  oceanCurrentSamples: OceanCurrentSample[]
  temperatureAnomalySamples: TemperatureAnomalySample[]
  officialWarnings: OfficialWarning[]
  provenance: WeatherModeProvenance
  radarOpacity: number
  animationQuality: AnimationQuality
  onViewportChange: (viewport: WeatherViewport) => void
  onPointerWeatherChange: (reading: MapWeatherPointer | null) => void
  onMapClick: (location: WeatherLocation) => void
}

export function AetherMap({
  location,
  mapLanguage,
  mode,
  samples,
  jetStreamSamples,
  airQualitySamples,
  oceanCurrentSamples,
  temperatureAnomalySamples,
  officialWarnings,
  provenance,
  radarOpacity,
  animationQuality,
  onViewportChange,
  onPointerWeatherChange,
  onMapClick
}: AetherMapProps) {
  const { t } = useI18n()
  const elementRef = useRef<HTMLDivElement | null>(null)
  const initialLocationRef = useRef(location)
  const locationRef = useRef(location)
  const mapRef = useRef<L.Map | null>(null)
  const badgeLayerRef = useRef<L.LayerGroup | null>(null)
  const animationRef = useRef<WeatherMapAnimation | null>(null)
  const warningLayerRef = useRef<OfficialWarningLayer | null>(null)
  const layersRef = useRef<AetherMapLayers | null>(null)
  const samplesRef = useRef(samples)
  const jetStreamSamplesRef = useRef(jetStreamSamples)
  const airQualitySamplesRef = useRef(airQualitySamples)
  const oceanCurrentSamplesRef = useRef(oceanCurrentSamples)
  const temperatureAnomalySamplesRef = useRef(temperatureAnomalySamples)
  const officialWarningsRef = useRef(officialWarnings)
  const modeRef = useRef(mode)
  const provenanceRef = useRef(provenance)
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
  const reportedFirePointerBlockedRef = useRef(false)
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
    oceanCurrentSamplesRef.current = oceanCurrentSamples
    pointerRefreshRef.current()
  }, [oceanCurrentSamples])

  useEffect(() => {
    temperatureAnomalySamplesRef.current = temperatureAnomalySamples
    pointerRefreshRef.current()
  }, [temperatureAnomalySamples])

  useEffect(() => {
    modeRef.current = mode
    provenanceRef.current = provenance
    pointerRefreshRef.current()
  }, [mode, provenance])

  useEffect(() => {
    pointerCallbackRef.current = onPointerWeatherChange
    clickCallbackRef.current = onMapClick
  }, [onPointerWeatherChange, onMapClick])

  useEffect(() => {
    const mapElement = elementRef.current

    if (!mapElement || mapRef.current) {
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
    const map = L.map(mapElement, {
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
    const updateMinimumZoom = () => {
      map.setMinZoom(Math.max(
        ABSOLUTE_MIN_ZOOM,
        map.getBoundsZoom(REGIONAL_VIEW_BOUNDS)
      ))
    }

    updateMinimumZoom()

    const layers = createAetherMapLayers({
      map,
      mapLanguage,
      t,
      updateFireLayerStatus,
      onReportedFirePointerChange: blocked => {
        reportedFirePointerBlockedRef.current = blocked

        if (blocked) {
          pointerCallbackRef.current(null)
        } else {
          pointerRefreshRef.current()
        }
      }
    })

    badgeLayerRef.current = layers.badgeLayer
    layersRef.current = layers
    const animation = new WeatherMapAnimation(
      map,
      mapElement,
      t('ocean.seaTemperature')
    )
    animation.start()
    animationRef.current = animation
    const warningLayer = new OfficialWarningLayer(map, mapLanguage, t)

    warningLayer.setWarnings(officialWarningsRef.current)
    warningLayerRef.current = warningLayer

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

      if (
        pointerWeatherBlocked ||
        reportedFirePointerBlockedRef.current ||
        !pointer
      ) {
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
      const oceanCurrent = modeRef.current === 'ocean-current'
        ? interpolateOceanCurrentAt(
            pointer.latitude,
            pointer.longitude,
            oceanCurrentSamplesRef.current
          )
        : null
      const temperatureAnomaly = modeRef.current === 'temperature-anomaly'
        ? interpolateTemperatureAnomalyAt(
            pointer.latitude,
            pointer.longitude,
            temperatureAnomalySamplesRef.current
          )
        : null
      const fire = layers.findFireAtPoint(L.point(pointer.x, pointer.y))

      pointerCallbackRef.current({
        ...reading,
        ...(jetStream ?? {}),
        ...(airQuality ?? {}),
        ...(oceanCurrent ?? {}),
        ...(temperatureAnomaly
          ? {
              normalTemperature: temperatureAnomaly.normalTemperature,
              temperatureAnomaly: reading.temperature -
                temperatureAnomaly.normalTemperature,
              temperatureBaseline: temperatureAnomaly.baseline
            }
          : {}),
        ...(fire ? { fire } : {}),
        provenance: provenanceRef.current[modeRef.current],
        screenX: Math.max(12, Math.min(pointer.x + 16, size.x - 236)),
        screenY: Math.max(12, Math.min(pointer.y + 16, size.y - 330))
      })
    }
    const handleMouseMove = (event: MouseEvent) => {
      const target = event.target

      if (
        target instanceof Element &&
        target.closest(MAP_POINTER_BLOCK_SELECTOR)
      ) {
        clearPointerWeather()
        return
      }

      const containerPoint = map.mouseEventToContainerPoint(event)
      const latlng = map.containerPointToLatLng(containerPoint)

      lastPointerRef.current = {
        latitude: latlng.lat,
        longitude: latlng.lng,
        x: containerPoint.x,
        y: containerPoint.y
      }
      window.cancelAnimationFrame(pointerFrameRef.current)
      pointerFrameRef.current = window.requestAnimationFrame(emitPointerWeather)
    }
    const clearPointerWeather = () => {
      window.cancelAnimationFrame(pointerFrameRef.current)
      lastPointerRef.current = null
      reportedFirePointerBlockedRef.current = false
      pointerCallbackRef.current(null)
    }
    const handleMapMouseLeave = (event: MouseEvent) => {
      const nextTarget = event.relatedTarget

      if (
        nextTarget instanceof Element &&
        nextTarget.closest('.map-weather-tooltip')
      ) {
        return
      }

      clearPointerWeather()
    }
    const handleWindowMouseMove = (event: MouseEvent) => {
      const target = event.target

      if (
        target instanceof Element &&
        target.closest(MAP_POINTER_BLOCK_SELECTOR)
      ) {
        clearPointerWeather()
      }
    }
    const pointerBlockingControls = [
      layers.controlContainer,
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
    map.on('resize', updateMinimumZoom)
    map.on('click', handleMapClick)
    map.on('movestart zoomstart', clearPointerWeather)
    mapElement.addEventListener('mousemove', handleMouseMove, {
      capture: true,
      passive: true
    })
    mapElement.addEventListener('mouseleave', handleMapMouseLeave)
    window.addEventListener('resize', handleWindowResize)
    window.addEventListener('mousemove', handleWindowMouseMove, {
      capture: true,
      passive: true
    })
    motionQuery.addEventListener('change', handleMotionPreferenceChange)
    emitViewport()
    mapRef.current = map

    return () => {
      window.cancelAnimationFrame(frameRef.current)
      window.cancelAnimationFrame(pointerFrameRef.current)
      window.removeEventListener('resize', handleWindowResize)
      window.removeEventListener('mousemove', handleWindowMouseMove, true)
      motionQuery.removeEventListener('change', handleMotionPreferenceChange)
      for (const control of pointerBlockingControls) {
        control?.removeEventListener('mouseenter', blockPointerWeather)
        control?.removeEventListener('mouseleave', unblockPointerWeather)
      }
      map.off('moveend zoomend resize', scheduleViewport)
      map.off('moveend zoomend resize', animation.invalidate, animation)
      map.off('resize', updateMinimumZoom)
      map.off('click', handleMapClick)
      map.off('movestart zoomstart', clearPointerWeather)
      mapElement.removeEventListener('mousemove', handleMouseMove, true)
      mapElement.removeEventListener('mouseleave', handleMapMouseLeave)
      pointerRefreshRef.current = () => {}
      pointerCallbackRef.current(null)
      animation.destroy()
      warningLayer.destroy()
      layers.destroy()
      map.remove()
      mapRef.current = null
      badgeLayerRef.current = null
      animationRef.current = null
      warningLayerRef.current = null
      layersRef.current = null
    }
  }, [mapLanguage, onViewportChange, t])

  useEffect(() => {
    layersRef.current?.setMapLanguage(mapLanguage)
    warningLayerRef.current?.setLanguage(mapLanguage, t)
  }, [mapLanguage])

  useEffect(() => {
    officialWarningsRef.current = officialWarnings
    warningLayerRef.current?.setWarnings(officialWarnings)
  }, [officialWarnings])

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

    if (
      mode === 'air-quality' ||
      mode === 'temperature-anomaly' ||
      mode === 'jet-stream' ||
      mode === 'ocean-current'
    ) {
      return
    }

    for (const sample of samples.filter(sample => sample.showBadge !== false)) {
      const marker = L.marker([sample.latitude, sample.longitude], {
        interactive: false,
        icon: L.divIcon({
          className: 'weather-badge-marker',
          html: renderWeatherBadge(sample, mode, t('mode.storm')),
          iconSize: [112, 46],
          iconAnchor: [-8, 36]
        })
      })

      marker.addTo(badgeLayer)
    }
  }, [samples, mode, t])

  useEffect(() => {
    animationRef.current?.setData(
      samples,
      mode,
      airQualitySamples,
      jetStreamSamples,
      oceanCurrentSamples,
      temperatureAnomalySamples
    )
    animationRef.current?.setQuality(animationQuality)
    layersRef.current?.setWeatherMode(mode, radarOpacity)
  }, [
    airQualitySamples,
    animationQuality,
    jetStreamSamples,
    oceanCurrentSamples,
    temperatureAnomalySamples,
    samples,
    mode,
    radarOpacity
  ])

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
        aria-label={t('map.aria', { location: location.label })}
        aria-describedby="map-keyboard-instructions"
        onKeyDown={handleMapKeyDown}
      />
      <p id="map-keyboard-instructions" className="visually-hidden">
        {t('map.instructions')}
      </p>
      <FireLayerStatus statuses={fireLayerStatuses} />
    </>
  )
}
