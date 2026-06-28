import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AetherHeader } from './components/AetherHeader'
import { AetherMap } from './components/AetherMap'
import { MapWeatherTooltip } from './components/MapWeatherTooltip'
import { WeatherDashboard } from './components/WeatherDashboard'
import { defaultCity } from './data/cityCatalog'
import { searchCity } from './services/geocoding'
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
  WeatherLocation,
  WeatherMapSample,
  WeatherMode,
  WeatherViewport
} from './types/weather'

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
  const [status, setStatus] = useState('Reading sky')
  const [selectedLocation, setSelectedLocation] = useState<WeatherLocation>(defaultCity)
  const [weatherMode, setWeatherMode] = useState<WeatherMode>('temperature')
  const [viewport, setViewport] = useState<WeatherViewport | null>(null)
  const [mapSamples, setMapSamples] = useState<WeatherMapSample[]>([])
  const [pointerWeather, setPointerWeather] = useState<MapWeatherPointer | null>(null)
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
          setWeather(nextWeather)
          setStatus('Live')
        }
      } catch (error) {
        const cachedWeather = await getCachedWeatherForLocation(selectedLocation)

        if (!cancelled) {
          if (cachedWeather) {
            setWeather(cachedWeather)
            setStatus('Cached')
          } else {
            setStatus(error instanceof Error ? error.message : 'Weather fetch failed')
          }
        }
      }
    }

    loadWeather()

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
          mode={weatherMode}
          samples={displayedSamples}
          onViewportChange={handleViewportChange}
          onPointerWeatherChange={handlePointerWeatherChange}
        />
        <MapWeatherTooltip reading={pointerWeather} />
        <AetherHeader
          location={selectedLocation}
          status={status}
          onSearch={handleCitySearch}
        />
        <WeatherDashboard
          weather={weather}
          status={status}
          mode={weatherMode}
          onModeChange={setWeatherMode}
        />
      </main>
    </ThemeProvider>
  )
}
