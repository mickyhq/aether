import { useEffect, useRef } from 'react'
import { WeatherSimulation } from '../canvas/WeatherSimulation'
import type { WeatherConfig, WeatherMapSample, WeatherMode, WeatherViewport } from '../types/weather'

type WeatherCanvasProps = {
  weather: WeatherConfig | null
  mode: WeatherMode
  viewport: WeatherViewport | null
  samples: WeatherMapSample[]
}

export function WeatherCanvas({ weather, mode, viewport, samples }: WeatherCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const weatherRef = useRef<WeatherConfig | null>(weather)
  const modeRef = useRef<WeatherMode>(mode)
  const viewportRef = useRef<WeatherViewport | null>(viewport)
  const samplesRef = useRef<WeatherMapSample[]>(samples)

  useEffect(() => {
    weatherRef.current = weather
  }, [weather])

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  useEffect(() => {
    samplesRef.current = samples
  }, [samples])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')

    if (!canvas || !context) {
      return
    }

    const simulation = new WeatherSimulation(
      canvas,
      context,
      () => weatherRef.current,
      () => modeRef.current,
      () => viewportRef.current,
      () => samplesRef.current
    )
    simulation.start()

    return () => {
      simulation.stop()
    }
  }, [])

  return <canvas id="weather-canvas" ref={canvasRef} aria-label="Procedural weather simulation" />
}
