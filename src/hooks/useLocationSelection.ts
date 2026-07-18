import { useCallback, useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { reverseGeocode, searchCity } from '../services/geocoding'
import type { WeatherLocation } from '../types/weather'
import { recordProviderRequestError } from '../services/clientTelemetry'

const REVERSE_GEOCODE_DEBOUNCE_MS = 350

type LocationSelectionOptions = {
  setLocation: Dispatch<SetStateAction<WeatherLocation>>
  setStatus: Dispatch<SetStateAction<string>>
  setForecastReady: Dispatch<SetStateAction<boolean>>
  getCachedPlace: (location: WeatherLocation) => string | null
  onLocationNavigation: () => void
}

export function useLocationSelection({
  setLocation,
  setStatus,
  setForecastReady,
  getCachedPlace,
  onLocationNavigation
}: LocationSelectionOptions) {
  const abortRef = useRef<AbortController | null>(null)
  const timeoutRef = useRef(0)
  const requestRef = useRef(0)

  const cancelPendingReverseGeocode = useCallback(() => {
    requestRef.current += 1
    window.clearTimeout(timeoutRef.current)
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  useEffect(() => cancelPendingReverseGeocode, [cancelPendingReverseGeocode])

  const handleMapClick = useCallback((location: WeatherLocation) => {
    cancelPendingReverseGeocode()
    const cachedPlace = getCachedPlace(location)
    const nextLocation = cachedPlace
      ? { ...location, label: cachedPlace }
      : location

    setForecastReady(false)
    setLocation(nextLocation)

    if (cachedPlace) {
      setStatus('Reading sky')
      return
    }

    setStatus('Locating')

    const requestId = requestRef.current
    const controller = new AbortController()

    abortRef.current = controller
    timeoutRef.current = window.setTimeout(async () => {
      try {
        const label = await reverseGeocode(
          location.latitude,
          location.longitude,
          controller.signal
        )

        if (requestId !== requestRef.current) {
          return
        }

        abortRef.current = null
        setForecastReady(false)
        setLocation(current => (
          current.latitude === location.latitude &&
          current.longitude === location.longitude
            ? { ...current, label }
            : current
        ))
      } catch (error) {
        recordProviderRequestError('geocoding', error, controller.signal)
        return
      }
    }, REVERSE_GEOCODE_DEBOUNCE_MS)
  }, [
    cancelPendingReverseGeocode,
    getCachedPlace,
    setForecastReady,
    setLocation,
    setStatus
  ])

  const handleCitySearch = useCallback(async (query: string) => {
    cancelPendingReverseGeocode()

    try {
      setStatus('Searching city')
      const nextLocation = await searchCity(query)

      onLocationNavigation()
      setForecastReady(false)
      setLocation(nextLocation)
    } catch (error) {
      recordProviderRequestError('geocoding', error)
      setStatus(error instanceof Error ? error.message : 'City search failed')
    }
  }, [
    cancelPendingReverseGeocode,
    onLocationNavigation,
    setForecastReady,
    setLocation,
    setStatus
  ])

  const handleSavedLocationSelect = useCallback((location: WeatherLocation) => {
    cancelPendingReverseGeocode()
    onLocationNavigation()
    setForecastReady(false)
    setLocation(location)
    setStatus('Reading sky')
  }, [
    cancelPendingReverseGeocode,
    onLocationNavigation,
    setForecastReady,
    setLocation,
    setStatus
  ])

  return {
    handleMapClick,
    handleCitySearch,
    handleSavedLocationSelect
  }
}
