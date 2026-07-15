import Brightness2Icon from '@mui/icons-material/Brightness2'
import CloudIcon from '@mui/icons-material/Cloud'
import NightsStayIcon from '@mui/icons-material/NightsStay'
import VisibilityIcon from '@mui/icons-material/Visibility'
import { Box, Typography } from '@mui/material'
import { useEffect, useState, type CSSProperties } from 'react'
import { fetchStargazingForecast } from '../services/stargazing'
import type {
  StargazingForecast,
  StargazingNight,
  WeatherLocation
} from '../types/weather'

export function StargazingIndex({ location }: { location: WeatherLocation | null }) {
  const [forecast, setForecast] = useState<StargazingForecast | null>(null)
  const [nightIndex, setNightIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    if (!location) {
      setForecast(null)
      return
    }

    const controller = new AbortController()

    setForecast(null)
    setNightIndex(0)
    setUnavailable(false)
    setLoading(true)

    void fetchStargazingForecast(location, controller.signal)
      .then(setForecast)
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setUnavailable(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [location])

  if (!location) return null

  const night = forecast?.nights[nightIndex]

  return (
    <Box className="stargazing-index" aria-live="polite">
      <Box className="stargazing-heading">
        <Box>
          <NightsStayIcon />
          <Typography variant="caption">Stargazing index</Typography>
        </Box>
        <Typography variant="caption">3-night astro forecast</Typography>
      </Box>

      {loading && <Typography variant="caption">Reading the night sky…</Typography>}
      {unavailable && <Typography variant="caption">Stargazing forecast unavailable</Typography>}
      {forecast && forecast.nights.length === 0 && (
        <Typography variant="caption">No dark observing window in the next three days.</Typography>
      )}

      {forecast && forecast.nights.length > 0 && (
        <>
          <Box className="stargazing-nights" role="tablist" aria-label="Night forecast">
            {forecast.nights.map((item, index) => (
              <button
                key={item.date}
                role="tab"
                aria-selected={nightIndex === index}
                className={nightIndex === index ? 'is-selected' : ''}
                onClick={() => setNightIndex(index)}
              >
                {formatNight(item.date)}
                <strong>{item.score}</strong>
              </button>
            ))}
          </Box>

          {night && (
            <Box className="stargazing-reading">
              <Box
                className={`stargazing-score is-${night.rating.toLowerCase()}`}
                style={{ '--stargazing-score': `${night.score}%` } as CSSProperties}
              >
                <strong>{night.score}</strong>
                <span>{night.rating}</span>
              </Box>
              <Box className="stargazing-factors">
                <Factor icon={<CloudIcon />} label={`${night.cloudCover}% cloud`} />
                <Factor icon={<VisibilityIcon />} label={`${night.seeingArcseconds.toFixed(1)}″ seeing`} />
                <Factor icon={<VisibilityIcon />} label={`${night.transparency.toFixed(2)} mag/airmass`} />
                <Factor
                  icon={<Brightness2Icon />}
                  label={`${night.moonIllumination}% moon · ${night.moonPhase}`}
                />
                <Factor
                  icon={<NightsStayIcon />}
                  label={forecast.lightPollution
                    ? `Estimated Bortle ${forecast.lightPollution.estimatedBortle}`
                    : 'Light pollution unavailable'}
                />
              </Box>
            </Box>
          )}

          {night && (
            <Typography variant="caption" className="stargazing-best-time">
              Best forecast slot: {formatUtcTime(night)} · 7Timer + World Atlas estimate
            </Typography>
          )}
        </>
      )}
    </Box>
  )
}

function Factor({ icon, label }: { icon: React.ReactNode, label: string }) {
  return (
    <span className="stargazing-factor">
      {icon}
      {label}
    </span>
  )
}

function formatNight(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  }).format(new Date(`${value}T12:00:00Z`))
}

function formatUtcTime(night: StargazingNight) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC'
  }).format(new Date(night.bestTime)) + ' UTC'
}
