import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { WeatherMapAnimation } from '../map/WeatherMapAnimation'
import { WeatherRadarLayer } from '../map/WeatherRadarLayer'
import { interpolateWeatherAt } from '../services/weatherGrid'
import type { MapWeatherPointer, WeatherLocation, WeatherMapSample, WeatherMode, WeatherViewport } from '../types/weather'

type AetherMapProps = {
  location: WeatherLocation
  mode: WeatherMode
  samples: WeatherMapSample[]
  onViewportChange: (viewport: WeatherViewport) => void
  onPointerWeatherChange: (reading: MapWeatherPointer | null) => void
}

export function AetherMap({
  location,
  mode,
  samples,
  onViewportChange,
  onPointerWeatherChange
}: AetherMapProps) {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const initialLocationRef = useRef(location)
  const mapRef = useRef<L.Map | null>(null)
  const badgeLayerRef = useRef<L.LayerGroup | null>(null)
  const animationRef = useRef<WeatherMapAnimation | null>(null)
  const radarRef = useRef<WeatherRadarLayer | null>(null)
  const samplesRef = useRef(samples)
  const pointerCallbackRef = useRef(onPointerWeatherChange)
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
    samplesRef.current = samples
    pointerRefreshRef.current()
  }, [samples])

  useEffect(() => {
    pointerCallbackRef.current = onPointerWeatherChange
  }, [onPointerWeatherChange])

  useEffect(() => {
    if (!elementRef.current || mapRef.current) {
      return
    }

    const initialLocation = initialLocationRef.current
    const map = L.map(elementRef.current, {
      center: [initialLocation.latitude, initialLocation.longitude],
      zoom: 10,
      zoomControl: true,
      worldCopyJump: true
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map)
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
    const emitPointerWeather = () => {
      const pointer = lastPointerRef.current

      if (!pointer) {
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

      pointerCallbackRef.current({
        ...reading,
        screenX: Math.max(12, Math.min(pointer.x + 16, size.x - 206)),
        screenY: Math.max(12, Math.min(pointer.y + 16, size.y - 142))
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
    pointerRefreshRef.current = emitPointerWeather
    const handleWindowResize = () => {
      map.invalidateSize()
      animation.invalidate()
      scheduleViewport()
    }
    map.on('moveend zoomend resize', scheduleViewport)
    map.on('move zoom resize', animation.invalidate, animation)
    map.on('mousemove', handleMouseMove)
    map.on('movestart zoomstart', clearPointerWeather)
    elementRef.current.addEventListener('mouseleave', clearPointerWeather)
    window.addEventListener('resize', handleWindowResize)
    emitViewport()
    mapRef.current = map

    return () => {
      window.cancelAnimationFrame(frameRef.current)
      window.cancelAnimationFrame(pointerFrameRef.current)
      window.removeEventListener('resize', handleWindowResize)
      map.off('moveend zoomend resize', scheduleViewport)
      map.off('move zoom resize', animation.invalidate, animation)
      map.off('mousemove', handleMouseMove)
      map.off('movestart zoomstart', clearPointerWeather)
      elementRef.current?.removeEventListener('mouseleave', clearPointerWeather)
      pointerRefreshRef.current = () => {}
      pointerCallbackRef.current(null)
      animation.destroy()
      radar.destroy()
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

    map.flyTo(nextCenter, Math.max(map.getZoom(), 10), {
      animate: true,
      duration: 1.1
    })
  }, [location])

  useEffect(() => {
    const badgeLayer = badgeLayerRef.current

    if (!badgeLayer) {
      return
    }

    badgeLayer.clearLayers()

    for (const sample of samples.filter(sample => sample.showBadge !== false)) {
      const marker = L.marker([sample.latitude, sample.longitude], {
        interactive: false,
        icon: L.divIcon({
          className: 'weather-badge-marker',
          html: renderBadge(sample, mode),
          iconSize: [112, 46],
          iconAnchor: [-8, 36]
        })
      })

      marker.addTo(badgeLayer)
    }
  }, [samples, mode])

  useEffect(() => {
    animationRef.current?.setData(samples, mode)
    radarRef.current?.setMode(mode)
  }, [samples, mode])

  return <div ref={elementRef} className="aether-map" aria-label="Global weather map" />
}

function renderBadge(sample: WeatherMapSample, mode: WeatherMode) {
  const metric = formatMetric(sample, mode)
  const estimate = sample.estimated ? '~' : ''

  return `
    <div class="weather-map-badge">
      <span class="weather-map-badge-place">${escapeHtml(sample.label)}</span>
      <span class="weather-map-badge-value">${estimate}${escapeHtml(metric)}</span>
    </div>
  `
}

function formatMetric(sample: WeatherMapSample, mode: WeatherMode) {
  if (mode === 'temperature') {
    return `${Math.round(sample.temperature)}°C`
  }

  if (mode === 'wind') {
    return `${Math.round(sample.rawWindSpeed)} km/h`
  }

  if (mode === 'precipitation') {
    return `${sample.precipitation.toFixed(1)} mm`
  }

  return sample.isThunderstorm ? 'Storm' : 'No storm'
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
