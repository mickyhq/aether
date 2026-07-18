import { useCallback, useEffect, useRef, useState } from 'react'
import { reverseGeocode } from '../services/geocoding'
import { getRadarSampleKey, sampleRadarRainAt } from '../services/radarRain'
import type {
  MapWeatherPointer,
  RadarRainReading,
  WeatherLocation
} from '../types/weather'
import { usePageVisibility } from './usePageVisibility'
import { recordProviderRequestError } from '../services/clientTelemetry'

const CLICK_GEOCODE_DEBOUNCE_MS = 650
const CLICK_RADAR_DEBOUNCE_MS = 1000

export function useMapPointerWeather() {
  const pageVisible = usePageVisibility()
  const [pointerWeather, setPointerWeather] = useState<MapWeatherPointer | null>(null)
  const geocodeAbortRef = useRef<AbortController | null>(null)
  const geocodeTimeoutRef = useRef(0)
  const geocodeKeyRef = useRef('')
  const geocodePendingKeyRef = useRef('')
  const placeCacheRef = useRef(new Map<string, string | null>())
  const radarTimeoutRef = useRef(0)
  const radarRequestRef = useRef(0)
  const radarKeyRef = useRef('')
  const radarResultRef = useRef<{
    key: string
    reading: RadarRainReading
  } | null>(null)

  useEffect(() => () => {
    window.clearTimeout(geocodeTimeoutRef.current)
    geocodeAbortRef.current?.abort()
    window.clearTimeout(radarTimeoutRef.current)
    radarRequestRef.current += 1
  }, [])

  useEffect(() => {
    if (pageVisible) {
      return
    }

    window.clearTimeout(geocodeTimeoutRef.current)
    geocodeAbortRef.current?.abort()
    geocodeAbortRef.current = null
    window.clearTimeout(radarTimeoutRef.current)
    radarRequestRef.current += 1
    setPointerWeather(null)
  }, [pageVisible])

  const handlePointerWeatherChange = useCallback((
    reading: MapWeatherPointer | null
  ) => {
    if (!pageVisible) {
      return
    }

    window.clearTimeout(radarTimeoutRef.current)

    if (!reading) {
      window.clearTimeout(geocodeTimeoutRef.current)
      geocodeAbortRef.current?.abort()
      geocodeAbortRef.current = null
      geocodeKeyRef.current = ''
      geocodePendingKeyRef.current = ''
      radarKeyRef.current = ''
      radarResultRef.current = null
      radarRequestRef.current += 1
      setPointerWeather(null)
      return
    }

    const key = getPlaceKey(reading.latitude, reading.longitude)
    const previousPlaceKey = geocodeKeyRef.current
    const samePlaceCell = previousPlaceKey === key
    const radarKey = getRadarSampleKey(reading.latitude, reading.longitude)
    const cachedPlace = placeCacheRef.current.get(key)
    const cachedRadar = radarResultRef.current?.key === radarKey
      ? radarResultRef.current.reading
      : null
    const nextReading = {
      ...reading,
      ...(cachedRadar ? { radarRain: cachedRadar } : {})
    }

    if (!samePlaceCell) {
      window.clearTimeout(geocodeTimeoutRef.current)
      geocodeAbortRef.current?.abort()
      geocodeAbortRef.current = null
      geocodePendingKeyRef.current = ''
    }

    geocodeKeyRef.current = key
    radarKeyRef.current = radarKey
    setPointerWeather(current => {
      const retainedPlace = samePlaceCell ? current?.placeLabel : undefined
      const placeLabel = cachedPlace ?? retainedPlace

      return placeLabel
        ? { ...nextReading, placeLabel }
        : nextReading
    })

    if (!cachedRadar) {
      const radarRequest = radarRequestRef.current + 1

      radarRequestRef.current = radarRequest
      radarTimeoutRef.current = window.setTimeout(async () => {
        if (
          radarRequestRef.current !== radarRequest ||
          radarKeyRef.current !== radarKey
        ) {
          return
        }

        setPointerWeather(current => current
          ? { ...current, radarRain: { status: 'checking' } }
          : current)

        const radarRain = await sampleRadarRainAt(
          reading.latitude,
          reading.longitude
        )

        if (
          radarRequestRef.current !== radarRequest ||
          radarKeyRef.current !== radarKey
        ) {
          return
        }

        radarResultRef.current = { key: radarKey, reading: radarRain }
        setPointerWeather(current => current
          ? { ...current, radarRain }
          : current)
      }, CLICK_RADAR_DEBOUNCE_MS)
    }

    if (
      placeCacheRef.current.has(key) ||
      geocodePendingKeyRef.current === key
    ) {
      return
    }

    geocodePendingKeyRef.current = key
    geocodeTimeoutRef.current = window.setTimeout(async () => {
      const controller = new AbortController()

      geocodeAbortRef.current = controller

      try {
        const label = await reverseGeocode(
          reading.latitude,
          reading.longitude,
          controller.signal
        )
        const place = isCoordinateLabel(label) ? null : label

        placeCacheRef.current.set(key, place)

        if (geocodeKeyRef.current === key && place) {
          setPointerWeather(current => current
            ? { ...current, placeLabel: place }
            : current)
        }
      } catch (error) {
        recordProviderRequestError('geocoding', error, controller.signal)
        return
      } finally {
        if (geocodePendingKeyRef.current === key) {
          geocodePendingKeyRef.current = ''
        }

        if (geocodeAbortRef.current === controller) {
          geocodeAbortRef.current = null
        }
      }
    }, CLICK_GEOCODE_DEBOUNCE_MS)
  }, [pageVisible])

  const getCachedPlace = useCallback((location: WeatherLocation) => (
    placeCacheRef.current.get(
      getPlaceKey(location.latitude, location.longitude)
    ) ?? null
  ), [])

  return {
    pointerWeather,
    handlePointerWeatherChange,
    getCachedPlace
  }
}

function getPlaceKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(2)}:${longitude.toFixed(2)}`
}

function isCoordinateLabel(label: string) {
  return /^-?\d+\.\d{3}, -?\d+\.\d{3}$/.test(label)
}
