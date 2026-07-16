import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  AIR_QUALITY_REFRESH_INTERVAL,
  fetchAirQualityMapSamples,
  getCachedAirQualityMapSamples
} from '../services/airQuality'
import {
  JET_STREAM_REFRESH_INTERVAL,
  fetchJetStreamSamples
} from '../services/jetStream'
import {
  OCEAN_CURRENT_REFRESH_INTERVAL,
  fetchOceanCurrentData
} from '../services/oceanCurrents'
import {
  WEATHER_REFRESH_INTERVAL,
  fetchWeatherMapSamples,
  getCachedWeatherMapSamples,
  hydrateWeatherMapCache
} from '../services/weatherGrid'
import type {
  AirQualityMapSample,
  JetStreamSample,
  OceanCurrentData,
  WeatherLocation,
  WeatherMapSample,
  WeatherMode,
  WeatherViewport
} from '../types/weather'
import { usePollingScheduler } from './usePollingScheduler'

type MapWeatherDataOptions = {
  viewport: WeatherViewport | null
  mode: WeatherMode
  location: WeatherLocation
  forecastReady: boolean
  setStatus: Dispatch<SetStateAction<string>>
}

export function useMapWeatherData({
  viewport,
  mode,
  location,
  forecastReady,
  setStatus
}: MapWeatherDataOptions) {
  const previousJetStreamViewportRef = useRef<WeatherViewport | null>(null)
  const jetStreamViewportRef = useRef<WeatherViewport | null>(null)
  const jetStreamLocationRef = useRef('')
  const [mapSamples, setMapSamples] = useState<WeatherMapSample[]>([])
  const [jetStreamSamples, setJetStreamSamples] = useState<JetStreamSample[]>([])
  const [airQualitySamples, setAirQualitySamples] = useState<AirQualityMapSample[]>([])
  const [oceanCurrentData, setOceanCurrentData] = useState<OceanCurrentData | null>(null)
  const viewportKey = getViewportKey(viewport)

  useEffect(() => {
    if (!viewport || mode === 'jet-stream') {
      return
    }

    let cancelled = false
    const cachedSamples = getCachedWeatherMapSamples(viewport)

    if (cachedSamples.length > 0) {
      setMapSamples(cachedSamples)
    }

    void hydrateWeatherMapCache(viewport).then(samples => {
      if (!cancelled && samples.length > 0) {
        setMapSamples(current => current.length > 0 ? current : samples)
      }
    })

    return () => {
      cancelled = true
    }
  }, [mode, viewport])

  const refreshVisibleWeather = useCallback(async (signal: AbortSignal) => {
    if (!viewport) {
      return
    }

    const samples = await fetchWeatherMapSamples(viewport, signal)

    if (!signal.aborted && samples.length > 0) {
      setMapSamples(samples)
    }
  }, [viewport])

  const handleWeatherError = useCallback((error: unknown) => {
    setStatus(error instanceof Error ? error.message : 'Map weather failed')
  }, [setStatus])

  usePollingScheduler({
    enabled: Boolean(viewport) && mode !== 'jet-stream' && forecastReady,
    intervalMs: WEATHER_REFRESH_INTERVAL,
    initialDelayMs: 120,
    restartKey: `${mode}:${forecastReady}:${viewportKey}`,
    task: refreshVisibleWeather,
    onError: handleWeatherError
  })

  useEffect(() => {
    if (!viewport || mode !== 'jet-stream') {
      previousJetStreamViewportRef.current = null
      jetStreamViewportRef.current = null
      return
    }

    const locationKey = `${location.latitude}:${location.longitude}`
    const locationChanged = jetStreamLocationRef.current !== locationKey
    const previousViewport = previousJetStreamViewportRef.current
    const zoomChanged = previousViewport !== null &&
      previousViewport.zoom !== viewport.zoom

    previousJetStreamViewportRef.current = viewport
    jetStreamLocationRef.current = locationKey

    if (locationChanged || !jetStreamViewportRef.current || !zoomChanged) {
      jetStreamViewportRef.current = viewport
    }
  }, [location, mode, viewport])

  const refreshJetStream = useCallback(async (signal: AbortSignal) => {
    const samplingViewport = jetStreamViewportRef.current

    if (!samplingViewport) {
      return
    }

    const samples = await fetchJetStreamSamples(samplingViewport, signal)

    if (!signal.aborted && samples.length > 0) {
      setJetStreamSamples(samples)
    }
  }, [])

  usePollingScheduler({
    enabled: Boolean(viewport) && mode === 'jet-stream',
    intervalMs: JET_STREAM_REFRESH_INTERVAL,
    initialDelayMs: 120,
    restartKey: `${location.latitude}:${location.longitude}:${viewportKey}`,
    task: refreshJetStream
  })

  useEffect(() => {
    if (viewport) {
      setAirQualitySamples(getCachedAirQualityMapSamples(viewport))
    }
  }, [viewport])

  const refreshAirQuality = useCallback(async (signal: AbortSignal) => {
    if (!viewport) {
      return
    }

    const samples = await fetchAirQualityMapSamples(viewport, signal)

    if (!signal.aborted) {
      setAirQualitySamples(samples)
    }
  }, [viewport])

  usePollingScheduler({
    enabled: Boolean(viewport),
    intervalMs: AIR_QUALITY_REFRESH_INTERVAL,
    initialDelayMs: 180,
    restartKey: viewportKey,
    task: refreshAirQuality
  })

  const refreshOceanCurrents = useCallback(async (signal: AbortSignal) => {
    if (!viewport) {
      return
    }

    const data = await fetchOceanCurrentData(viewport, signal)

    if (!signal.aborted) {
      setOceanCurrentData(data)
    }
  }, [viewport])

  const handleOceanCurrentError = useCallback((error: unknown) => {
    setStatus(error instanceof Error ? error.message : 'Ocean currents failed')
  }, [setStatus])

  usePollingScheduler({
    enabled: Boolean(viewport) && mode === 'ocean-current',
    intervalMs: OCEAN_CURRENT_REFRESH_INTERVAL,
    initialDelayMs: 120,
    restartKey: `${mode}:${viewportKey}`,
    task: refreshOceanCurrents,
    onError: handleOceanCurrentError
  })

  return {
    mapSamples,
    jetStreamSamples,
    airQualitySamples,
    oceanCurrentData
  }
}

function getViewportKey(viewport: WeatherViewport | null) {
  if (!viewport) {
    return 'none'
  }

  return [
    viewport.north,
    viewport.south,
    viewport.east,
    viewport.west,
    viewport.zoom,
    viewport.width,
    viewport.height
  ].join(':')
}
