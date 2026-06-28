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
  WeatherConfig,
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
  const [selectedLocation, setSelectedLocation] = useState<WeatherLocation>(
    loadStoredLocation() ?? defaultCity
  )
  const [weatherMode, setWeatherMode] = useState<WeatherMode>('temperature')
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
      try {
        setStatus('Reading sky')
        const forecast = await fetchOpenMeteoForecast(selectedLocation)
        const nextWeather = translateWeather(forecast, selectedLocation)
        cacheWeatherSample(selectedLocation, nextWeather)

        if (!cancelled) {
          lastWeatherRef.current = nextWeather
          setWeather(nextWeather)
          setStatus('Live')
        }
      } catch (error) {
        const cachedWeather = await getCachedWeatherForLocation(selectedLocation)

        if (!cancelled) {
          const fallback = cachedWeather ?? lastWeatherRef.current

          if (fallback) {
            setWeather(fallback)
            setStatus('Cached')
          } else {
            setStatus(error instanceof Error ? error.message : 'Weather fetch failed')
          }
        }
      }
    }

    loadWeather()
    persistLocation(selectedLocation)

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

    setMapSamples(cachedSamples)

    const applyPersistentCache = async () => {
      const samples = await hydrateWeatherMapCache(viewport)

      if (!cancelled && samples.length > 0) {
        setMapSamples(samples)
      }
    }
    const refreshVisibleWeather = async () => {
      if (loading) {
        return
      }

      loading = true

      try {
        const samples = await fetchWeatherMapSamples(viewport)

        if (!cancelled) {
          setMapSamples(samples)
        }
      } catch (error) {
        if (!cancelled) {
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

    void applyPersistentCache()
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
    setSelectedLocation(location)
    setStatus('Locating')

    try {
      const label = await reverseGeocode(location.latitude, location.longitude)

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
          onSearch={handleCitySearch}
        />
        <WeatherDashboard
          weather={weather}
          airQuality={selectedAirQuality}
          status={status}
          mode={weatherMode}
          onModeChange={setWeatherMode}
        />
      </main>
    </ThemeProvider>
  )
}
