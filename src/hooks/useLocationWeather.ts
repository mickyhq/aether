import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchEcmwfLocationForecast } from '../services/ecmwf'
import { fetchOfficialHeatAlerts } from '../services/heatAlerts'
import { fetchOpenMeteoForecast } from '../services/openMeteo'
import { persistLocation } from '../services/appState'
import {
  cacheWeatherSample,
  getCachedWeatherForLocation
} from '../services/weatherGrid'
import type {
  EcmwfForecast,
  HeatAlert,
  WeatherConfig,
  WeatherDataState,
  WeatherEvolutionFrame,
  WeatherLocation
} from '../types/weather'
import { translateWeather } from '../weather/translateWeather'
import { usePageVisibility } from './usePageVisibility'

export function useLocationWeather(location: WeatherLocation) {
  const [weather, setWeather] = useState<WeatherConfig | null>(null)
  const lastWeatherRef = useRef<WeatherConfig | null>(null)
  const [status, setStatus] = useState('Reading sky')
  const [dataState, setDataState] = useState<WeatherDataState>('loading')
  const [request, setRequest] = useState(0)
  const forceRefreshRef = useRef(false)
  const [forecastReady, setForecastReady] = useState(false)
  const [officialHeatAlerts, setOfficialHeatAlerts] = useState<HeatAlert[]>([])
  const [ecmwfForecast, setEcmwfForecast] = useState<EcmwfForecast | null>(null)
  const [ecmwfLoading, setEcmwfLoading] = useState(true)
  const [ecmwfFrame, setEcmwfFrame] = useState<WeatherEvolutionFrame | null>(null)
  const pageVisible = usePageVisibility()

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    persistLocation(location)

    if (!pageVisible) {
      setForecastReady(false)
      return () => {
        cancelled = true
      }
    }

    async function loadWeather() {
      const forceRefresh = forceRefreshRef.current

      forceRefreshRef.current = false
      setForecastReady(false)
      setDataState('loading')

      try {
        setStatus('Reading sky')
        const forecast = await fetchOpenMeteoForecast(
          location,
          forceRefresh,
          controller.signal
        )
        const nextWeather = translateWeather(forecast.payload, location)

        cacheWeatherSample(location, nextWeather)

        if (!cancelled) {
          lastWeatherRef.current = nextWeather
          setWeather(nextWeather)
          setDataState(forecast.source)
          setStatus(formatDataState(forecast.source))
        }
      } catch {
        const cachedWeather = await getCachedWeatherForLocation(location)

        if (!cancelled) {
          const fallback = cachedWeather ?? lastWeatherRef.current

          if (fallback) {
            setWeather(fallback)
            setDataState('stale')
            setStatus('Stale')
          } else {
            setDataState('unavailable')
            setStatus('Unavailable')
          }
        }
      } finally {
        if (!cancelled) {
          setForecastReady(true)
        }
      }
    }

    void loadWeather()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [location, pageVisible, request])

  useEffect(() => {
    if (!pageVisible) {
      return
    }

    const controller = new AbortController()

    setEcmwfLoading(true)
    setEcmwfFrame(null)

    void fetchEcmwfLocationForecast(location, controller.signal)
      .then(forecast => {
        if (!controller.signal.aborted) {
          setEcmwfForecast(forecast)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setEcmwfForecast(null)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setEcmwfLoading(false)
        }
      })

    return () => controller.abort()
  }, [location, pageVisible])

  useEffect(() => {
    if (!pageVisible) {
      return
    }

    const controller = new AbortController()

    setOfficialHeatAlerts([])

    void fetchOfficialHeatAlerts(location, controller.signal).then(alerts => {
      if (!controller.signal.aborted) {
        setOfficialHeatAlerts(alerts)
      }
    }).catch(() => {})

    return () => controller.abort()
  }, [location, pageVisible])

  const retry = useCallback(() => {
    forceRefreshRef.current = true
    setStatus('Reading sky')
    setDataState('loading')
    setForecastReady(false)
    setRequest(current => current + 1)
  }, [])

  return {
    weather,
    status,
    setStatus,
    dataState,
    forecastReady,
    setForecastReady,
    officialHeatAlerts,
    ecmwfForecast,
    ecmwfLoading,
    ecmwfFrame,
    setEcmwfFrame,
    retry
  }
}

function formatDataState(
  state: Exclude<WeatherDataState, 'loading' | 'unavailable'>
) {
  return state.charAt(0).toUpperCase() + state.slice(1)
}
