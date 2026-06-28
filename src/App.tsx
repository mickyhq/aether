import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { AetherHeader } from './components/AetherHeader'
import { AetherMap } from './components/AetherMap'
import { MapWeatherTooltip } from './components/MapWeatherTooltip'
import { WeatherDashboard } from './components/WeatherDashboard'
import { defaultCity } from './data/cityCatalog'
import {
  AIR_QUALITY_REFRESH_INTERVAL,
  fetchAirQualityMapSamples,
  getCachedAirQualityMapSamples,
  interpolateAirQualityAt
} from './services/airQuality'
import { reverseGeocode, searchCity } from './services/geocoding'
import { fetchOpenMeteoForecast } from './services/openMeteo'
import { fetchOfficialHeatAlerts } from './services/heatAlerts'
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
  MapWeatherPointer,
  HeatAlert,
  WeatherConfig,
  WeatherDataState,
  AirQualityMapSample,
  WeatherLocation,
  WeatherMapSample,
  WeatherMode,
  WeatherViewport
} from './types/weather'

const STORED_LOCATION_KEY = 'aether:location'

function loadStoredLocation(): WeatherLocation | null {
  try {
    const stored = window.localStorage.getItem(STORED_LOCATION_KEY)

    if (!stored) {
      return null
    }

    const parsed = JSON.parse(stored) as WeatherLocation

    if (
      typeof parsed.latitude !== 'number' ||
      typeof parsed.longitude !== 'number' ||
      typeof parsed.label !== 'string'
    ) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function readUrlLocation(): WeatherLocation | null {
  try {
    const params = new URLSearchParams(window.location.search)
    const raw = params.get('coords')

    if (!raw) {
      return null
    }

    const parts = raw.split(',')

    if (parts.length !== 2) {
      return null
    }

    const latitude = parseFloat(parts[0])
    const longitude = parseFloat(parts[1])

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null
    }

    return {
      latitude,
      longitude,
      label: `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`
    }
  } catch {
    return null
  }
}

const WEATHER_MODES: readonly WeatherMode[] = [
  'temperature',
  'wind',
  'jet-stream',
  'precipitation',
  'storm',
  'air-quality'
]

function readUrlMode(): WeatherMode {
  try {
    const params = new URLSearchParams(window.location.search)
    const raw = params.get('mode')

    if (raw && WEATHER_MODES.includes(raw as WeatherMode)) {
      return raw as WeatherMode
    }

    return 'temperature'
  } catch {
    return 'temperature'
  }
}

function updateUrlLocation(location: WeatherLocation, mode: WeatherMode) {
  try {
    const params = new URLSearchParams(window.location.search)
    const coordValue = `${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`

    if (params.get('coords') === coordValue && params.get('mode') === mode) {
      return
    }

    params.set('coords', coordValue)
    params.set('mode', mode)
    const search = params.toString()

    window.history.replaceState(null, '', `?${search}`)
  } catch {
    return
  }
}

function persistLocation(location: WeatherLocation) {
  try {
    window.localStorage.setItem(STORED_LOCATION_KEY, JSON.stringify({
      latitude: location.latitude,
      longitude: location.longitude,
      label: location.label
    }))
  } catch {
    return
  }
}

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
  const [officialHeatAlerts, setOfficialHeatAlerts] = useState<HeatAlert[]>([])
  const [selectedLocation, setSelectedLocation] = useState<WeatherLocation>(
    readUrlLocation() ?? loadStoredLocation() ?? defaultCity
  )
  const [selectedForecastReady, setSelectedForecastReady] = useState(false)
  const [weatherMode, setWeatherMode] = useState<WeatherMode>(readUrlMode)
  const mapWeatherMode = useDeferredValue(weatherMode)
  const [viewport, setViewport] = useState<WeatherViewport | null>(null)
  const [mapSamples, setMapSamples] = useState<WeatherMapSample[]>([])
  const [airQualitySamples, setAirQualitySamples] = useState<AirQualityMapSample[]>([])
  const [pointerWeather, setPointerWeather] = useState<MapWeatherPointer | null>(null)
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

  useEffect(() => {
    let cancelled = false

    async function loadWeather() {
      setSelectedForecastReady(false)
      setWeatherDataState('loading')

      try {
        setStatus('Reading sky')
        const forecast = await fetchOpenMeteoForecast(selectedLocation)
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
    if (!viewport) {
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
  }, [selectedForecastReady, viewport])

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

  async function handleMapClick(location: WeatherLocation) {
    setSelectedForecastReady(false)
    setSelectedLocation(location)
    setStatus('Locating')

    try {
      const label = await reverseGeocode(location.latitude, location.longitude)

      setSelectedForecastReady(false)
      setSelectedLocation(prev => ({
        ...prev,
        label
      }))
    } catch {
      return
    }
  }

  async function handleCitySearch(query: string) {
    try {
      setStatus('Searching city')
      const nextLocation = await searchCity(query)
      setSelectedForecastReady(false)
      setSelectedLocation(nextLocation)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'City search failed')
    }
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <main className="app-shell">
        <AetherMap
          location={selectedLocation}
          mode={mapWeatherMode}
          samples={displayedSamples}
          airQualitySamples={airQualitySamples}
          onViewportChange={handleViewportChange}
          onPointerWeatherChange={handlePointerWeatherChange}
          onMapClick={handleMapClick}
        />
        <MapWeatherTooltip reading={pointerWeather} />
        <AetherHeader
          location={selectedLocation}
          status={status}
          dataState={weatherDataState}
          onSearch={handleCitySearch}
        />
        <WeatherDashboard
          weather={weather}
          airQuality={selectedAirQuality}
          officialHeatAlerts={officialHeatAlerts}
          mode={weatherMode}
          onModeChange={setWeatherMode}
        />
      </main>
    </ThemeProvider>
  )
}

function formatDataState(state: Exclude<WeatherDataState, 'loading' | 'unavailable'>) {
  return state.charAt(0).toUpperCase() + state.slice(1)
}
