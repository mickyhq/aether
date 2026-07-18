import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { Box, IconButton, Typography } from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import type { RadarFrame } from '../schemas/serverResponses'
import { usePageVisibility } from '../hooks/usePageVisibility'
import { useI18n } from '../i18n/I18nContext'
import { fetchRadarTimelineFrames } from '../services/radarTimeline'
import type {
  EcmwfForecast,
  PrecipitationPlayback,
  WeatherEvolutionFrame
} from '../types/weather'
import { prefersReducedMotion } from '../utils/motion'

const RADAR_FRAME_COUNT = 6
const FORECAST_FRAME_COUNT = 12
const RADAR_REFRESH_MS = 5 * 60 * 1000

type TimelineItem =
  | {
      kind: 'radar'
      path: string
      time: string
    }
  | {
      kind: 'forecast'
      frame: WeatherEvolutionFrame
      time: string
    }

type PrecipitationForecastTimelineProps = {
  forecast: EcmwfForecast | null
  loading: boolean
  onFrameChange?: (frame: WeatherEvolutionFrame | null) => void
  onPlaybackChange: (time: string | null) => void
  onPrecipitationPlaybackChange: (playback: PrecipitationPlayback) => void
}

export function PrecipitationForecastTimeline({
  forecast,
  loading,
  onFrameChange,
  onPlaybackChange,
  onPrecipitationPlaybackChange
}: PrecipitationForecastTimelineProps) {
  const { language, t } = useI18n()
  const pageVisible = usePageVisibility()
  const [radarFrames, setRadarFrames] = useState<RadarFrame[]>([])
  const [radarLoading, setRadarLoading] = useState(true)
  const [frameIndex, setFrameIndex] = useState(0)
  const [playing, setPlaying] = useState<TimelineItem['kind'] | null>(null)
  const items = useMemo(
    () => buildTimeline(radarFrames, forecast?.frames ?? []),
    [forecast, radarFrames]
  )
  const selected = items[frameIndex] ?? null
  const radarCount = items.filter(item => item.kind === 'radar').length
  const forecastCount = items.length - radarCount

  useEffect(() => {
    if (!pageVisible) {
      return
    }

    const controller = new AbortController()
    const refresh = async () => {
      const frames = await fetchRadarTimelineFrames(controller.signal)

      if (!controller.signal.aborted) {
        if (frames.length > 0) {
          setRadarFrames(frames)
        }

        setRadarLoading(false)
      }
    }
    const interval = window.setInterval(() => {
      void refresh()
    }, RADAR_REFRESH_MS)

    void refresh()

    return () => {
      controller.abort()
      window.clearInterval(interval)
    }
  }, [pageVisible])

  useEffect(() => {
    const lastObservedIndex = items.reduce(
      (lastIndex, item, index) => item.kind === 'radar' ? index : lastIndex,
      -1
    )

    setFrameIndex(Math.max(0, lastObservedIndex))
    setPlaying(null)
  }, [items])

  useEffect(() => {
    if (radarLoading || !selected) {
      return
    }

    if (selected.kind === 'radar') {
      onFrameChange?.(null)
      onPlaybackChange(null)
      onPrecipitationPlaybackChange({
        kind: 'radar',
        path: selected.path,
        time: selected.time
      })
      return
    }

    onFrameChange?.(selected.frame)
    onPlaybackChange(selected.time)
    onPrecipitationPlaybackChange({
      kind: 'forecast',
      time: selected.time
    })
  }, [
    onFrameChange,
    onPlaybackChange,
    onPrecipitationPlaybackChange,
    radarLoading,
    selected
  ])

  useEffect(() => () => {
    onFrameChange?.(null)
    onPlaybackChange(null)
    onPrecipitationPlaybackChange({ kind: 'latest' })
  }, [onFrameChange, onPlaybackChange, onPrecipitationPlaybackChange])

  useEffect(() => {
    if (
      !pageVisible ||
      !playing ||
      prefersReducedMotion()
    ) {
      return
    }

    const firstIndex = playing === 'radar' ? 0 : radarCount
    const lastIndex = playing === 'radar'
      ? radarCount - 1
      : items.length - 1

    if (lastIndex <= firstIndex) {
      return
    }

    const interval = window.setInterval(() => {
      setFrameIndex(current => (
        current < firstIndex || current >= lastIndex
          ? firstIndex
          : current + 1
      ))
    }, 1400)

    return () => window.clearInterval(interval)
  }, [items.length, pageVisible, playing, radarCount])

  if (radarLoading) {
    return <Box className="ecmwf-forecast">{t('precipitation.loading')}</Box>
  }

  if (!selected) {
    return (
      <Box className="ecmwf-forecast">
        {t(loading ? 'precipitation.loading' : 'forecast.unavailable')}
      </Box>
    )
  }

  const forecastSelected = selected.kind === 'forecast'
  const storm = forecastSelected && selected.frame.isThunderstorm
  const snow = forecastSelected && selected.frame.snowfall >= 0.02

  return (
    <Box
      className="ecmwf-forecast precipitation-forecast-timeline"
      aria-label={t('precipitation.timelineAria')}
    >
      <Box className="ecmwf-forecast-heading">
        <Box>
          <Typography className={`precipitation-timeline-source is-${selected.kind}`}>
            {t(forecastSelected
              ? 'precipitation.forecastSource'
              : 'precipitation.radarSource')}
          </Typography>
          <Typography className="ecmwf-forecast-time">
            {formatTimelineTime(selected.time, language)}
          </Typography>
        </Box>
      </Box>

      <Box className="ecmwf-forecast-values">
        {forecastSelected ? (
          <>
            <span>
              {snow
                ? t('precipitation.snowAmount', {
                    amount: selected.frame.snowfall.toFixed(1)
                  })
                : `${selected.frame.precipitation.toFixed(1)} mm`}
            </span>
            <span>{t(storm
              ? 'precipitation.stormRisk'
              : snow
                ? 'precipitation.snowForecast'
                : 'precipitation.modelForecast')}</span>
          </>
        ) : (
          <span>{t('precipitation.measuredRadar')}</span>
        )}
      </Box>

      <Box className="precipitation-timeline-scale">
        {radarCount > 0 && (
          <Box
            className="precipitation-timeline-segment is-radar"
            style={{ flex: radarCount }}
          >
            <span>{t('precipitation.past')}</span>
            <IconButton
              className="precipitation-segment-play"
              size="small"
              aria-label={t(playing === 'radar'
                ? 'precipitation.pauseRadar'
                : 'precipitation.playRadar')}
              onClick={() => {
                const nextPlaying = playing === 'radar' ? null : 'radar'

                setPlaying(nextPlaying)

                if (nextPlaying) {
                  setFrameIndex(0)
                }
              }}
              disabled={radarCount < 2 || prefersReducedMotion()}
            >
              {playing === 'radar' ? <PauseIcon /> : <PlayArrowIcon />}
            </IconButton>
          </Box>
        )}
        {forecastCount > 0 && (
          <Box
            className="precipitation-timeline-segment is-forecast"
            style={{ flex: forecastCount }}
          >
            <span>{t('precipitation.nextTwelveHours')}</span>
            <IconButton
              className="precipitation-segment-play"
              size="small"
              aria-label={t(playing === 'forecast'
                ? 'precipitation.pauseForecast'
                : 'precipitation.playForecast')}
              onClick={() => {
                const nextPlaying = playing === 'forecast' ? null : 'forecast'

                setPlaying(nextPlaying)

                if (nextPlaying) {
                  setFrameIndex(radarCount)
                }
              }}
              disabled={forecastCount < 2 || prefersReducedMotion()}
            >
              {playing === 'forecast' ? <PauseIcon /> : <PlayArrowIcon />}
            </IconButton>
          </Box>
        )}
      </Box>

      <input
        className="ecmwf-time-slider precipitation-time-slider"
        type="range"
        min="0"
        max={Math.max(0, items.length - 1)}
        value={frameIndex}
        aria-label={t('precipitation.timeAria')}
        onChange={event => {
          setPlaying(null)
          setFrameIndex(Number(event.target.value))
        }}
      />
    </Box>
  )
}

function buildTimeline(
  radarFrames: RadarFrame[],
  forecastFrames: WeatherEvolutionFrame[]
): TimelineItem[] {
  const observed = radarFrames.slice(-RADAR_FRAME_COUNT).map(frame => ({
    kind: 'radar' as const,
    path: frame.path,
    time: new Date(frame.time * 1000).toISOString()
  }))
  const latestObservation = observed.length > 0
    ? Date.parse(observed[observed.length - 1].time)
    : Date.now()
  const forecast = forecastFrames
    .filter(frame => Date.parse(frame.time) > latestObservation)
    .slice(0, FORECAST_FRAME_COUNT)
    .map(frame => ({
      kind: 'forecast' as const,
      frame,
      time: frame.time
    }))

  return [...observed, ...forecast]
}

function formatTimelineTime(value: string, language: string) {
  return new Intl.DateTimeFormat(language, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}
