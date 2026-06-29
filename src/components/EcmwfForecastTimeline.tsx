import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { Box, IconButton, Typography } from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import type { EcmwfForecast } from '../types/weather'
import { prefersReducedMotion } from '../utils/motion'

type EcmwfForecastTimelineProps = {
  forecast: EcmwfForecast | null
  loading: boolean
}

export function EcmwfForecastTimeline({
  forecast,
  loading
}: EcmwfForecastTimelineProps) {
  const [frameIndex, setFrameIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const frames = forecast?.frames ?? []
  const selected = frames[frameIndex]
  const points = useMemo(() => buildTemperaturePoints(frames), [frames])
  const isEcmwf = forecast?.model.includes('ECMWF') ?? false

  useEffect(() => {
    const currentIndex = frames.findIndex(frame => (
      new Date(frame.time).getTime() >= Date.now()
    ))

    setFrameIndex(Math.max(0, currentIndex))
    setPlaying(false)
  }, [forecast])

  useEffect(() => {
    if (!playing || frames.length < 2 || prefersReducedMotion()) {
      return
    }

    const interval = window.setInterval(() => {
      setFrameIndex(current => (current + 1) % frames.length)
    }, 900)

    return () => window.clearInterval(interval)
  }, [frames.length, playing])

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
          onClick={() => setPlaying(current => !current)}
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

function formatForecastTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}
