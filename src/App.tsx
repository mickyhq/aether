import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import { Suspense, lazy, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { AetherHeader } from './components/AetherHeader'
import { MapWeatherTooltip } from './components/MapWeatherTooltip'
import { OfflineStatus } from './components/OfflineStatus'
import { RadarOpacityControl } from './components/RadarOpacityControl'
import { WeatherErrorBoundary } from './components/WeatherErrorBoundary'
import {
  AIR_QUALITY_REFRESH_INTERVAL,
  fetchAirQualityMapSamples,
  getCachedAirQualityMapSamples,
  interpolateAirQualityAt
} from './services/airQuality'
import { reverseGeocode, searchCity } from './services/geocoding'
import {
  loadInitialLocation,
  loadRadarOpacity,
  persistLocation,
  persistRadarOpacity,
  readUrlMode,
  updateUrlLocation
} from './services/appState'
import { fetchOpenMeteoForecast } from './services/openMeteo'
import { fetchEcmwfLocationForecast } from './services/ecmwf'
import { fetchOfficialHeatAlerts } from './services/heatAlerts'
import {
  JET_STREAM_REFRESH_INTERVAL,
  fetchJetStreamSamples
} from './services/jetStream'
import {
  WEATHER_REFRESH_INTERVAL,
  cacheWeatherSample,
  fetchWeatherMapSamples,
  getCachedWeatherForLocation,
  getCachedWeatherMapSamples,
  hydrateWeatherMapCache
} from './services/weatherGrid'
import { translateWeather } from './weather/translateWeather'
import type {
  EcmwfForecast,
  MapWeatherPointer,
  HeatAlert,
  WeatherConfig,
  WeatherDataState,
  AirQualityMapSample,
  JetStreamSample,
  WeatherLocation,
  WeatherMapSample,
  WeatherMode,
  WeatherViewport
} from './types/weather'

const REVERSE_GEOCODE_DEBOUNCE_MS = 350
const AetherMap = lazy(async () => ({
  default: (await import('./components/AetherMap')).AetherMap
}))
const WeatherDashboard = lazy(async () => ({
  default: (await import('./components/WeatherDashboard')).WeatherDashboard
}))

const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#071014',
      paper: 'rgba(12, 22, 28, 0.62)'
    },
    primary: {
      main: '#8fe5ff'
    },
    secondary: {
      main: '#b7f5c7'
    }
  },
  typography: {
    fontFamily: '"Inter", "SF Pro Display", system-ui, sans-serif'
  },
  shape: {
    borderRadius: 8
  }
})

export default function App() {
  const [weather, setWeather] = useState<WeatherConfig | null>(null)
  const lastWeatherRef = useRef<WeatherConfig | null>(null)
  const [status, setStatus] = useState('Reading sky')
  const [weatherDataState, setWeatherDataState] = useState<WeatherDataState>('loading')
  const [weatherRequest, setWeatherRequest] = useState(0)
  const forceWeatherRefreshRef = useRef(false)
  const [officialHeatAlerts, setOfficialHeatAlerts] = useState<HeatAlert[]>([])
  const [ecmwfForecast, setEcmwfForecast] = useState<EcmwfForecast | null>(null)
  const [ecmwfLoading, setEcmwfLoading] = useState(true)
  const [selectedLocation, setSelectedLocation] = useState<WeatherLocation>(
    loadInitialLocation
  )
  const [selectedForecastReady, setSelectedForecastReady] = useState(false)
  const [weatherMode, setWeatherMode] = useState<WeatherMode>(readUrlMode)
  const mapWeatherMode = useDeferredValue(weatherMode)
  const [viewport, setViewport] = useState<WeatherViewport | null>(null)
  const previousJetStreamViewportRef = useRef<WeatherViewport | null>(null)
  const jetStreamViewportRef = useRef<WeatherViewport | null>(null)
  const jetStreamLocationRef = useRef('')
  const [mapSamples, setMapSamples] = useState<WeatherMapSample[]>([])
  const [jetStreamSamples, setJetStreamSamples] = useState<JetStreamSample[]>([])
  const [airQualitySamples, setAirQualitySamples] = useState<AirQualityMapSample[]>([])
  const [pointerWeather, setPointerWeather] = useState<MapWeatherPointer | null>(null)
  const [radarOpacity, setRadarOpacity] = useState(loadRadarOpacity)
  const reverseGeocodeAbortRef = useRef<AbortController | null>(null)
  const reverseGeocodeTimeoutRef = useRef(0)
  const reverseGeocodeRequestRef = useRef(0)
  const selectedAirQuality = useMemo(
    () => interpolateAirQualityAt(
      selectedLocation.latitude,
      selectedLocation.longitude,
      airQualitySamples
    ),
    [airQualitySamples, selectedLocation]
  )
  const displayedSamples = useMemo(() => {
    if (mapSamples.length > 0 || !weather) {
      return mapSamples
    }

    return [{
      label: selectedLocation.label,
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
      temperature: weather.temperature,
      precipitation: weather.precipitation,
      snowfall: weather.snowfall,
      weatherCode: weather.weatherCode,
      windSpeed: weather.windSpeed,
      rawWindSpeed: weather.rawWindSpeed,
      windAngle: weather.windAngle,
      cloudOpacity: weather.cloudOpacity,
      isThunderstorm: weather.isThunderstorm
    }]
  }, [mapSamples, selectedLocation, weather])

  useEffect(() => () => {
    window.clearTimeout(reverseGeocodeTimeoutRef.current)
    reverseGeocodeAbortRef.current?.abort()
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadWeather() {
      const forceRefresh = forceWeatherRefreshRef.current

      forceWeatherRefreshRef.current = false
      setSelectedForecastReady(false)
      setWeatherDataState('loading')

      try {
        setStatus('Reading sky')
        const forecast = await fetchOpenMeteoForecast(
          selectedLocation,
          forceRefresh
        )
        const nextWeather = translateWeather(forecast.payload, selectedLocation)
        cacheWeatherSample(selectedLocation, nextWeather)

        if (!cancelled) {
          lastWeatherRef.current = nextWeather
          setWeather(nextWeather)
          setWeatherDataState(forecast.source)
          setStatus(formatDataState(forecast.source))
        }
      } catch (error) {
        const cachedWeather = await getCachedWeatherForLocation(selectedLocation)

        if (!cancelled) {
          const fallback = cachedWeather ?? lastWeatherRef.current

          if (fallback) {
            setWeather(fallback)
            setWeatherDataState('stale')
            setStatus('Stale')
          } else {
            setWeatherDataState('unavailable')
            setStatus('Unavailable')
          }
        }
      } finally {
        if (!cancelled) {
          setSelectedForecastReady(true)
        }
      }
    }

    loadWeather()
    persistLocation(selectedLocation)

    return () => {
      cancelled = true
    }
  }, [selectedLocation, weatherRequest])

  useEffect(() => {
    const controller = new AbortController()

    setEcmwfLoading(true)

    void fetchEcmwfLocationForecast(
      selectedLocation,
      controller.signal
    )
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
  }, [selectedLocation])

  useEffect(() => {
    updateUrlLocation(selectedLocation, weatherMode)
  }, [selectedLocation, weatherMode])

  useEffect(() => {
    let cancelled = false

    setOfficialHeatAlerts([])

    void fetchOfficialHeatAlerts(selectedLocation).then(alerts => {
      if (!cancelled) {
        setOfficialHeatAlerts(alerts)
      }
    })

    return () => {
      cancelled = true
    }
  }, [selectedLocation])

  const handleViewportChange = useCallback((nextViewport: WeatherViewport) => {
    setViewport(nextViewport)
  }, [])
  const handlePointerWeatherChange = useCallback((reading: MapWeatherPointer | null) => {
    setPointerWeather(reading)
  }, [])

  useEffect(() => {
    if (!viewport || mapWeatherMode === 'jet-stream') {
      return
    }

    let cancelled = false
    let loading = false
    const cachedSamples = getCachedWeatherMapSamples(viewport)

    setMapSamples(current => current.length > 0 ? current : cachedSamples)

    const applyPersistentCache = async () => {
      const samples = await hydrateWeatherMapCache(viewport)

      if (!cancelled && samples.length > 0) {
        setMapSamples(current => current.length > 0 ? current : samples)
      }
    }

    void applyPersistentCache()

    if (!selectedForecastReady) {
      return () => {
        cancelled = true
      }
    }

    const controller = new AbortController()
    const refreshVisibleWeather = async () => {
      if (loading) {
        return
      }

      loading = true

      try {
        const samples = await fetchWeatherMapSamples(viewport, controller.signal)

        if (!cancelled && samples.length > 0) {
          setMapSamples(samples)
        }
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          setStatus(error instanceof Error ? error.message : 'Map weather failed')
        }
      } finally {
        loading = false
      }
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshVisibleWeather()
      }
    }
    const timeout = window.setTimeout(refreshVisibleWeather, 120)
    const interval = window.setInterval(refreshVisibleWeather, WEATHER_REFRESH_INTERVAL)

    window.addEventListener('online', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeout)
      window.clearInterval(interval)
      window.removeEventListener('online', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [mapWeatherMode, selectedForecastReady, viewport])

  useEffect(() => {
    if (!viewport || mapWeatherMode !== 'jet-stream') {
      previousJetStreamViewportRef.current = null
      jetStreamViewportRef.current = null
      return
    }

    const locationKey = `${selectedLocation.latitude}:${selectedLocation.longitude}`
    const locationChanged = jetStreamLocationRef.current !== locationKey
    const previousViewport = previousJetStreamViewportRef.current
    const zoomChanged = previousViewport !== null &&
      previousViewport.zoom !== viewport.zoom

    previousJetStreamViewportRef.current = viewport
    jetStreamLocationRef.current = locationKey

    if (locationChanged || !jetStreamViewportRef.current || !zoomChanged) {
      jetStreamViewportRef.current = viewport
    }

    const samplingViewport = jetStreamViewportRef.current
    const controller = new AbortController()
    let cancelled = false
    let loading = false

    const refreshJetStream = async () => {
      if (loading) {
        return
      }

      loading = true

      try {
        const samples = await fetchJetStreamSamples(
          samplingViewport,
          controller.signal
        )

        if (!cancelled && samples.length > 0) {
          setJetStreamSamples(samples)
        }
      } finally {
        loading = false
      }
    }
    const timeout = window.setTimeout(refreshJetStream, 120)
    const interval = window.setInterval(
      refreshJetStream,
      JET_STREAM_REFRESH_INTERVAL
    )

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeout)
      window.clearInterval(interval)
    }
  }, [mapWeatherMode, selectedLocation, viewport])

  useEffect(() => {
    if (!viewport) {
      return
    }

    let cancelled = false
    let loading = false

    setAirQualitySamples(getCachedAirQualityMapSamples(viewport))

    const refreshAirQuality = async () => {
      if (loading) {
        return
      }

      loading = true

      try {
        const samples = await fetchAirQualityMapSamples(viewport)

        if (!cancelled) {
          setAirQualitySamples(samples)
        }
      } finally {
        loading = false
      }
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshAirQuality()
      }
    }
    const timeout = window.setTimeout(refreshAirQuality, 180)
    const interval = window.setInterval(refreshAirQuality, AIR_QUALITY_REFRESH_INTERVAL)

    window.addEventListener('online', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
      window.clearInterval(interval)
      window.removeEventListener('online', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [viewport])

  function handleMapClick(location: WeatherLocation) {
    cancelPendingReverseGeocode()
    setSelectedForecastReady(false)
    setSelectedLocation(location)
    setStatus('Locating')

    const requestId = reverseGeocodeRequestRef.current
    const controller = new AbortController()

    reverseGeocodeAbortRef.current = controller
    reverseGeocodeTimeoutRef.current = window.setTimeout(async () => {
      try {
        const label = await reverseGeocode(
          location.latitude,
          location.longitude,
          controller.signal
        )

        if (requestId !== reverseGeocodeRequestRef.current) {
          return
        }

        reverseGeocodeAbortRef.current = null
        setSelectedForecastReady(false)
        setSelectedLocation(prev => ({
          ...prev,
          label
        }))
      } catch {
        return
      }
    }, REVERSE_GEOCODE_DEBOUNCE_MS)
  }

  async function handleCitySearch(query: string) {
    cancelPendingReverseGeocode()

    try {
      setStatus('Searching city')
      const nextLocation = await searchCity(query)
      setSelectedForecastReady(false)
      setSelectedLocation(nextLocation)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'City search failed')
    }
  }

  function handleSavedLocationSelect(location: WeatherLocation) {
    cancelPendingReverseGeocode()
    setSelectedForecastReady(false)
    setSelectedLocation(location)
    setStatus('Reading sky')
  }

  function handleRadarOpacityChange(opacity: number) {
    setRadarOpacity(opacity)
    persistRadarOpacity(opacity)
  }

  function handleWeatherRetry() {
    forceWeatherRefreshRef.current = true
    setStatus('Reading sky')
    setWeatherDataState('loading')
    setSelectedForecastReady(false)
    setWeatherRequest(current => current + 1)
  }

  function cancelPendingReverseGeocode() {
    reverseGeocodeRequestRef.current += 1
    window.clearTimeout(reverseGeocodeTimeoutRef.current)
    reverseGeocodeAbortRef.current?.abort()
    reverseGeocodeAbortRef.current = null
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <main className="app-shell">
        <WeatherErrorBoundary
          area="map"
          resetKey={`${selectedLocation.latitude}:${selectedLocation.longitude}:${mapWeatherMode}`}
        >
          <Suspense fallback={<div className="map-loading">Loading map</div>}>
            <AetherMap
              location={selectedLocation}
              mode={mapWeatherMode}
              samples={displayedSamples}
              jetStreamSamples={jetStreamSamples}
              airQualitySamples={airQualitySamples}
              radarOpacity={radarOpacity}
              onViewportChange={handleViewportChange}
              onPointerWeatherChange={handlePointerWeatherChange}
              onMapClick={handleMapClick}
            />
          </Suspense>
          <RadarOpacityControl
            mode={weatherMode}
            opacity={radarOpacity}
            onChange={handleRadarOpacityChange}
          />
          <MapWeatherTooltip reading={pointerWeather} />
        </WeatherErrorBoundary>
        <OfflineStatus />
        <AetherHeader
          location={selectedLocation}
          status={status}
          dataState={weatherDataState}
          onSearch={handleCitySearch}
          onLocationSelect={handleSavedLocationSelect}
          onWeatherRetry={handleWeatherRetry}
        />
        <WeatherErrorBoundary
          area="forecast"
          resetKey={`${selectedLocation.latitude}:${selectedLocation.longitude}:${weatherMode}`}
        >
          <Suspense fallback={<div className="weather-panel">Loading forecast</div>}>
            <WeatherDashboard
              weather={weather}
              ecmwfForecast={ecmwfForecast}
              ecmwfLoading={ecmwfLoading}
              airQuality={selectedAirQuality}
              officialHeatAlerts={officialHeatAlerts}
              mode={weatherMode}
              onModeChange={setWeatherMode}
            />
          </Suspense>
        </WeatherErrorBoundary>
      </main>
    </ThemeProvider>
  )
}

function formatDataState(state: Exclude<WeatherDataState, 'loading' | 'unavailable'>) {
  return state.charAt(0).toUpperCase() + state.slice(1)
}
