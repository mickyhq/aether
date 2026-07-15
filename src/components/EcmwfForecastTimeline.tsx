import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { Box, IconButton, Typography } from '@mui/material'
import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import type { EcmwfForecast } from '../types/weather'
import { prefersReducedMotion } from '../utils/motion'
import { usePageVisibility } from '../hooks/usePageVisibility'
import { describeWeatherCode } from '../weather/weatherCode'

type EcmwfForecastTimelineProps = {
  forecast: EcmwfForecast | null
  loading: boolean
  onFrameChange?: (frame: EcmwfForecast['frames'][number] | null) => void
  onPlaybackChange?: (time: string | null) => void
}

export function EcmwfForecastTimeline({
  forecast,
  loading,
  onFrameChange,
  onPlaybackChange
}: EcmwfForecastTimelineProps) {
  const pageVisible = usePageVisibility()
  const [frameIndex, setFrameIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [hasPlayed, setHasPlayed] = useState(false)
  const frames = forecast?.frames ?? []
  const selected = frames[frameIndex]
  const points = useMemo(() => buildTemperaturePoints(frames), [frames])
  const temperatureRange = useMemo(() => getTemperatureRange(frames), [frames])
  const isEcmwf = forecast?.model.includes('ECMWF') ?? false

  useEffect(() => {
    const currentIndex = frames.findIndex(frame => (
      new Date(frame.time).getTime() >= Date.now()
    ))

    setFrameIndex(Math.max(0, currentIndex))
    setPlaying(false)
    setHasPlayed(false)
  }, [forecast])

  useEffect(() => {
    onFrameChange?.(selected ?? null)
  }, [onFrameChange, selected])

  useEffect(() => {
    onPlaybackChange?.(hasPlayed && selected ? selected.time : null)
  }, [hasPlayed, onPlaybackChange, selected])

  useEffect(() => (
    () => onPlaybackChange?.(null)
  ), [onPlaybackChange])

  useEffect(() => {
    if (
      !pageVisible ||
      !playing ||
      frames.length < 2 ||
      prefersReducedMotion()
    ) {
      return
    }

    const interval = window.setInterval(() => {
      setFrameIndex(current => (current + 1) % frames.length)
    }, 900)

    return () => window.clearInterval(interval)
  }, [frames.length, pageVisible, playing])

  if (loading) {
    return <Box className="ecmwf-forecast">Loading ECMWF forecast</Box>
  }

  if (!forecast || !selected) {
    return <Box className="ecmwf-forecast">ECMWF forecast unavailable</Box>
  }

  return (
    <Box
      className={`ecmwf-forecast ${isEcmwf ? '' : 'ecmwf-forecast-fallback'}`}
      aria-label="ECMWF visual forecast"
    >
      <Box className="ecmwf-forecast-heading">
        <Box>
          <Typography className="ecmwf-forecast-model">
            {isEcmwf ? forecast.model : 'ECMWF unavailable'}
          </Typography>
          <Typography className="ecmwf-forecast-time">
            {formatForecastTime(selected.time)}
          </Typography>
        </Box>
        <IconButton
          size="small"
          aria-label={playing ? 'Pause ECMWF forecast' : 'Play ECMWF forecast'}
          onClick={() => {
            setHasPlayed(true)
            setPlaying(current => !current)
          }}
          disabled={prefersReducedMotion()}
        >
          {playing ? <PauseIcon /> : <PlayArrowIcon />}
        </IconButton>
      </Box>

      {!isEcmwf && (
        <Typography className="ecmwf-forecast-note">
          Showing standard forecast until ECMWF data answers.
        </Typography>
      )}

      <Box className="ecmwf-forecast-values">
        <span>{Math.round(selected.temperature)}°C</span>
        <span>{selected.precipitation.toFixed(1)} mm</span>
        <span>{Math.round(selected.rawWindSpeed)} km/h</span>
      </Box>

      <Box
        className="ecmwf-visual-preview"
        style={buildForecastStyle(selected, temperatureRange)}
        aria-label="ECMWF animated weather preview"
      >
        <Box className="ecmwf-visual-sky" />
        <Box className="ecmwf-visual-clouds" />
        <Box className="ecmwf-visual-rain" />
        <Box className="ecmwf-visual-snow" />
        {selected.isThunderstorm && <Box className="ecmwf-visual-storm" />}
        <Box className="ecmwf-visual-ground" />
        <Box className="ecmwf-visual-wind">
          <span>➤</span>
        </Box>
        <Box className="ecmwf-visual-caption">
          {describeWeatherCode(selected.weatherCode)}
        </Box>
      </Box>

      <svg
        className="ecmwf-temperature-chart"
        viewBox="0 0 240 42"
        role="img"
        aria-label="ECMWF five-day temperature trend"
      >
        <polyline points={points} fill="none" stroke="#8fe5ff" strokeWidth="2" />
        <line
          x1={frameIndex / Math.max(1, frames.length - 1) * 240}
          x2={frameIndex / Math.max(1, frames.length - 1) * 240}
          y1="0"
          y2="42"
          stroke="#ffe59b"
          strokeWidth="1"
        />
      </svg>

      <input
        className="ecmwf-time-slider"
        type="range"
        min="0"
        max={Math.max(0, frames.length - 1)}
        value={frameIndex}
        aria-label="ECMWF forecast time"
        onChange={event => {
          setPlaying(false)
          setHasPlayed(true)
          setFrameIndex(Number(event.target.value))
        }}
      />
    </Box>
  )
}

function buildTemperaturePoints(frames: EcmwfForecast['frames']) {
  if (frames.length === 0) {
    return ''
  }

  const temperatures = frames.map(frame => frame.temperature)
  const minimum = Math.min(...temperatures)
  const range = Math.max(...temperatures) - minimum || 1

  return frames.map((frame, index) => {
    const x = index / Math.max(1, frames.length - 1) * 240
    const y = 38 - (frame.temperature - minimum) / range * 34

    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

function getTemperatureRange(frames: EcmwfForecast['frames']) {
  if (frames.length === 0) {
    return { minimum: 0, range: 1 }
  }

  const temperatures = frames.map(frame => frame.temperature)
  const minimum = Math.min(...temperatures)
  const range = Math.max(...temperatures) - minimum || 1

  return { minimum, range }
}

function buildForecastStyle(
  frame: EcmwfForecast['frames'][number],
  temperatureRange: { minimum: number, range: number }
) {
  const warmth = clamp(
    (frame.temperature - temperatureRange.minimum) / temperatureRange.range,
    0,
    1
  )
  const rain = clamp(frame.precipitation / 3, 0, 1)
  const snow = clamp(frame.snowfall / 2, 0, 1)
  const cloud = clamp(frame.cloudOpacity, 0, 1)
  const wind = clamp(frame.rawWindSpeed / 70, 0, 1)
  const coldHue = 205
  const warmHue = 26
  const hue = coldHue + (warmHue - coldHue) * warmth

  return {
    '--ecmwf-sky-hue': hue.toFixed(0),
    '--ecmwf-warmth': warmth.toFixed(3),
    '--ecmwf-cloud': cloud.toFixed(3),
    '--ecmwf-rain': rain.toFixed(3),
    '--ecmwf-snow': snow.toFixed(3),
    '--ecmwf-wind': wind.toFixed(3),
    '--ecmwf-wind-angle': `${frame.windAngle}rad`,
    '--ecmwf-storm': frame.isThunderstorm ? '1' : '0'
  } as CSSProperties
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function formatForecastTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}
