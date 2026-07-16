import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import { Suspense, lazy, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { AetherHeader } from './components/AetherHeader'
import { AnimationQualityControl } from './components/AnimationQualityControl'
import { ForecastDateLabel } from './components/ForecastDateLabel'
import { MapWeatherTooltip } from './components/MapWeatherTooltip'
import { OfflineStatus } from './components/OfflineStatus'
import { RadarOpacityControl } from './components/RadarOpacityControl'
import { WeatherErrorBoundary } from './components/WeatherErrorBoundary'
import { useLocationSelection } from './hooks/useLocationSelection'
import { useLocationWeather } from './hooks/useLocationWeather'
import { useMapWeatherData } from './hooks/useMapWeatherData'
import { useMapPointerWeather } from './hooks/useMapPointerWeather'
import { useI18n } from './i18n/I18nContext'
import { interpolateAirQualityAt } from './services/airQuality'
import {
  loadInitialLocation,
  loadAnimationQuality,
  loadRadarOpacity,
  persistAnimationQuality,
  persistRadarOpacity,
  readUrlMode,
  updateUrlLocation
} from './services/appState'
import { getWeatherMapSamplesAtTime } from './services/weatherGrid'
import { describeWeatherCode } from './weather/weatherCode'
import type {
  AnimationQuality,
  WeatherConfig,
  WeatherEvolutionFrame,
  WeatherLocation,
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
const AetherMap = lazy(async () => ({
  default: (await import('./components/AetherMap')).AetherMap
}))
const WeatherDashboard = lazy(async () => ({
  default: (await import('./components/WeatherDashboard')).WeatherDashboard
}))

export default function App() {
  const { language, t } = useI18n()
  const [selectedLocation, setSelectedLocation] = useState<WeatherLocation>(
    loadInitialLocation
  )
  const {
    weather,
    status,
    setStatus,
    dataState: weatherDataState,
    forecastReady: selectedForecastReady,
    setForecastReady: setSelectedForecastReady,
    officialHeatAlerts,
    ecmwfForecast,
    ecmwfLoading,
    ecmwfFrame,
    setEcmwfFrame,
    retry: retryWeather
  } = useLocationWeather(selectedLocation)
  const [ecmwfPlaybackTime, setEcmwfPlaybackTime] = useState<string | null>(null)
  const [weatherMode, setWeatherMode] = useState<WeatherMode>(readUrlMode)
  const mapWeatherMode = useDeferredValue(weatherMode)
  const [viewport, setViewport] = useState<WeatherViewport | null>(null)
  const {
    mapSamples,
    jetStreamSamples,
    airQualitySamples,
    oceanCurrentData
  } = useMapWeatherData({
    viewport,
    mode: mapWeatherMode,
    location: selectedLocation,
    forecastReady: selectedForecastReady,
    setStatus
  })
  const dashboardLocation = useMemo<WeatherLocation>(() => ({
    latitude: selectedLocation.latitude,
    longitude: selectedLocation.longitude,
    label: selectedLocation.label
  }), [selectedLocation.latitude, selectedLocation.longitude])
  const {
    pointerWeather,
    handlePointerWeatherChange,
    getCachedPlace
  } = useMapPointerWeather()
  const {
    handleMapClick,
    handleCitySearch,
    handleSavedLocationSelect
  } = useLocationSelection({
    setLocation: setSelectedLocation,
    setStatus,
    setForecastReady: setSelectedForecastReady,
    getCachedPlace
  })
  const [radarOpacity, setRadarOpacity] = useState(loadRadarOpacity)
  const [animationQuality, setAnimationQuality] = useState<AnimationQuality>(
    loadAnimationQuality
  )
  const selectedAirQuality = useMemo(
    () => interpolateAirQualityAt(
      selectedLocation.latitude,
      selectedLocation.longitude,
      airQualitySamples
    ),
    [airQualitySamples, selectedLocation]
  )
  const displayedWeather = useMemo(() => {
    if (
      !weather ||
      !ecmwfFrame ||
      weatherMode === 'jet-stream' ||
      weatherMode === 'air-quality'
    ) {
      return weather
    }

    return weatherFromEvolutionFrame(weather, ecmwfFrame)
  }, [ecmwfFrame, weather, weatherMode])
  const displayedSamples = useMemo(
    () => getWeatherMapSamplesAtTime(mapSamples, ecmwfPlaybackTime),
    [ecmwfPlaybackTime, mapSamples]
  )
  useEffect(() => {
    updateUrlLocation(selectedLocation, weatherMode)
  }, [selectedLocation, weatherMode])

  const handleViewportChange = useCallback((nextViewport: WeatherViewport) => {
    setViewport(nextViewport)
  }, [])

  function handleRadarOpacityChange(opacity: number) {
    setRadarOpacity(opacity)
    persistRadarOpacity(opacity)
  }

  function handleAnimationQualityChange(quality: AnimationQuality) {
    setAnimationQuality(quality)
    persistAnimationQuality(quality)
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <main className="app-shell">
        <WeatherErrorBoundary
          area="map"
          resetKey={`${selectedLocation.latitude}:${selectedLocation.longitude}:${mapWeatherMode}`}
        >
          <Suspense fallback={<div className="map-loading">{t('app.loadingMap')}</div>}>
            <AetherMap
              location={selectedLocation}
              mapLanguage={language}
              mode={mapWeatherMode}
              samples={displayedSamples}
              jetStreamSamples={jetStreamSamples}
              airQualitySamples={airQualitySamples}
              oceanCurrentSamples={oceanCurrentData?.samples ?? []}
              radarOpacity={radarOpacity}
              animationQuality={animationQuality}
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
          <AnimationQualityControl
            quality={animationQuality}
            onChange={handleAnimationQualityChange}
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
          onWeatherRetry={retryWeather}
        />
        <ForecastDateLabel time={ecmwfPlaybackTime} />
        <WeatherErrorBoundary
          area="forecast"
          resetKey={`${selectedLocation.latitude}:${selectedLocation.longitude}:${weatherMode}`}
        >
          <Suspense fallback={<div className="weather-panel">{t('app.loadingForecast')}</div>}>
            <WeatherDashboard
              weather={displayedWeather}
              alertWeather={weather}
              ecmwfForecast={ecmwfForecast}
              ecmwfLoading={ecmwfLoading}
              onEcmwfFrameChange={
                weatherMode === 'jet-stream' ||
                weatherMode === 'air-quality' ||
                weatherMode === 'ocean-current'
                  ? null
                  : setEcmwfFrame
              }
              onEcmwfPlaybackChange={setEcmwfPlaybackTime}
              airQuality={selectedAirQuality}
              officialHeatAlerts={officialHeatAlerts}
              location={dashboardLocation}
              mode={weatherMode}
              onModeChange={setWeatherMode}
            />
          </Suspense>
        </WeatherErrorBoundary>
      </main>
    </ThemeProvider>
  )
}

function weatherFromEvolutionFrame(
  weather: WeatherConfig,
  frame: WeatherEvolutionFrame
): WeatherConfig {
  return {
    ...weather,
    temperature: frame.temperature,
    precipitation: frame.precipitation,
    snowfall: frame.snowfall,
    weatherCode: frame.weatherCode,
    description: describeWeatherCode(frame.weatherCode),
    windSpeed: frame.windSpeed,
    rawWindSpeed: frame.rawWindSpeed,
    windAngle: frame.windAngle,
    rainDensity: Math.round(Math.min(12, Math.max(0, frame.precipitation)) * 42),
    isThunderstorm: frame.isThunderstorm,
    cloudOpacity: frame.cloudOpacity
  }
}
