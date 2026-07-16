import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchEcmwfLocationForecast } from '../services/ecmwf'
import {
  ageOfficialWarnings,
  enterOfficialWarningGrace,
  fetchOfficialWarnings
} from '../services/officialWarnings'
import { fetchOpenMeteoForecast } from '../services/openMeteo'
import { persistLocation } from '../services/appState'
import {
  cacheWeatherSample,
  getCachedWeatherForLocation
} from '../services/weatherGrid'
import type {
  EcmwfForecast,
  OfficialWarningsData,
  WeatherConfig,
  WeatherDataState,
  WeatherDataStatus,
  WeatherEvolutionFrame,
  WeatherLocation
} from '../types/weather'
import { translateWeather } from '../weather/translateWeather'
import { usePageVisibility } from './usePageVisibility'
import {
  recordProviderFailure,
  recordProviderRequestError
} from '../services/clientTelemetry'

export function useLocationWeather(location: WeatherLocation) {
  const [weather, setWeather] = useState<WeatherConfig | null>(null)
  const lastWeatherRef = useRef<WeatherConfig | null>(null)
  const [status, setStatus] = useState('Reading sky')
  const [dataState, setDataState] = useState<WeatherDataState>({
    status: 'loading',
    lastSuccessAt: null,
    staleAgeMs: null
  })
  const [request, setRequest] = useState(0)
  const forceRefreshRef = useRef(false)
  const [forecastReady, setForecastReady] = useState(false)
  const [officialWarnings, setOfficialWarnings] = useState<OfficialWarningsData | null>(null)
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
      setDataState(current => ({
        ...current,
        status: 'loading'
      }))

      try {
        setStatus('Reading sky')
        const forecast = await fetchOpenMeteoForecast(
          location,
          forceRefresh,
          controller.signal
        )
        const nextWeather = translateWeather(
          forecast.payload,
          location,
          forecast.refreshedAt
        )

        cacheWeatherSample(location, nextWeather)

        if (forecast.source === 'stale') {
          recordProviderFailure('weather')
        }

        if (!cancelled) {
          lastWeatherRef.current = nextWeather
          setWeather(nextWeather)
          setDataState({
            status: forecast.source,
            lastSuccessAt: Date.now(),
            staleAgeMs: forecast.source === 'live'
              ? 0
              : Math.max(0, Date.now() - forecast.refreshedAt)
          })
          setStatus(formatDataState(forecast.source))
        }
      } catch (error) {
        recordProviderRequestError('weather', error, controller.signal)
        const cachedWeather = await getCachedWeatherForLocation(location)

        if (!cancelled) {
          const fallback = cachedWeather ?? lastWeatherRef.current

          if (fallback) {
            setWeather(fallback)
            const refreshedAt = toTimestamp(fallback.provenance.refreshedAt)

            setDataState(current => ({
              status: 'stale',
              lastSuccessAt: refreshedAt ?? current.lastSuccessAt,
              staleAgeMs: refreshedAt === null
                ? current.staleAgeMs
                : Math.max(0, Date.now() - refreshedAt)
            }))
            setStatus('Stale')
          } else {
            setDataState(current => ({
              ...current,
              status: 'unavailable'
            }))
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
    if (
      dataState.staleAgeMs === null ||
      (dataState.status !== 'cached' && dataState.status !== 'stale')
    ) {
      return
    }

    const interval = window.setInterval(() => {
      setDataState(current => ({
        ...current,
        staleAgeMs: current.staleAgeMs === null
          ? null
          : current.staleAgeMs + 60_000
      }))
    }, 60_000)

    return () => window.clearInterval(interval)
  }, [dataState.staleAgeMs === null, dataState.status])

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
      .catch(error => {
        recordProviderRequestError('ecmwf', error, controller.signal)
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

    setOfficialWarnings(null)

    const loadWarnings = () => {
      void fetchOfficialWarnings(location, controller.signal).then(data => {
        if (!controller.signal.aborted) {
          setOfficialWarnings(data)
        }
      }).catch(error => {
        recordProviderRequestError('warnings', error, controller.signal)

        if (!controller.signal.aborted) {
          setOfficialWarnings(current => (
            current ? enterOfficialWarningGrace(current) : null
          ))
        }
      })
    }

    loadWarnings()
    const interval = window.setInterval(loadWarnings, 5 * 60 * 1000)
    const ageInterval = window.setInterval(() => {
      setOfficialWarnings(current => current
        ? ageOfficialWarnings(current)
        : null
      )
    }, 60_000)

    return () => {
      window.clearInterval(interval)
      window.clearInterval(ageInterval)
      controller.abort()
    }
  }, [location, pageVisible])

  const retry = useCallback(() => {
    forceRefreshRef.current = true
    setStatus('Reading sky')
    setDataState(current => ({
      ...current,
      status: 'loading'
    }))
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
    officialWarnings,
    ecmwfForecast,
    ecmwfLoading,
    ecmwfFrame,
    setEcmwfFrame,
    retry
  }
}

function formatDataState(
  state: Exclude<WeatherDataStatus, 'loading' | 'unavailable'>
) {
  return state.charAt(0).toUpperCase() + state.slice(1)
}

function toTimestamp(value: string | number | null) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const timestamp = Date.parse(value)

    return Number.isFinite(timestamp) ? timestamp : null
  }

  return null
}
