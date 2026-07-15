import GrassIcon from '@mui/icons-material/Grass'
import WaterDropIcon from '@mui/icons-material/WaterDrop'
import { Box, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { fetchSoilMoisture } from '../services/soilMoisture'
import type { SoilMoistureReading, WeatherLocation } from '../types/weather'
import { usePageVisibility } from '../hooks/usePageVisibility'

export function SoilMoisture({ location }: { location: WeatherLocation | null }) {
  const [reading, setReading] = useState<SoilMoistureReading | null>(null)
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const pageVisible = usePageVisibility()

  useEffect(() => {
    if (!location) {
      setReading(null)
      return
    }

    if (!pageVisible) {
      return
    }

    const controller = new AbortController()

    setReading(null)
    setUnavailable(false)
    setLoading(true)

    void fetchSoilMoisture(location, controller.signal)
      .then(setReading)
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setUnavailable(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [location, pageVisible])

  if (!location) return null

  return (
    <Box className="soil-moisture" aria-live="polite">
      <Box className="soil-moisture-heading">
        <Typography variant="caption">Drought & soil moisture</Typography>
        <Typography variant="caption">ERA5-Land · 11 km</Typography>
      </Box>

      {loading && <Box className="soil-moisture-status">Reading soil…</Box>}
      {unavailable && <Box className="soil-moisture-status">Soil data unavailable</Box>}

      {reading && (
        <>
          <Box className="soil-moisture-summary">
            <Box className={`soil-moisture-category ${getCategoryClass(reading.percentile)}`}>
              <GrassIcon />
              <Box>
                <Typography variant="body2">{reading.category}</Typography>
                <Typography variant="caption">
                  {reading.percentile}th percentile
                </Typography>
              </Box>
            </Box>
            <Box className="soil-moisture-values">
              <span><WaterDropIcon />Root {reading.rootZonePercent.toFixed(1)}%</span>
              <span>Surface {reading.surfacePercent.toFixed(1)}%</span>
            </Box>
          </Box>

          <Box className="soil-moisture-scale" aria-label={`Soil moisture ${reading.percentile}th percentile`}>
            <span style={{ left: `${Math.max(1, Math.min(99, reading.percentile))}%` }} />
          </Box>

          <Typography variant="caption" className="soil-moisture-detail">
            {formatTrend(reading.trend)} · Updated {formatDate(reading.date)}
          </Typography>
          <Typography variant="caption" className="soil-moisture-note">
            14-day root-zone estimate vs {reading.baseline}; not a garden sensor
          </Typography>
        </>
      )}
    </Box>
  )
}

function getCategoryClass(percentile: number) {
  if (percentile <= 10) return 'is-severe'
  if (percentile <= 30) return 'is-dry'
  if (percentile >= 80) return 'is-wet'
  return 'is-normal'
}

function formatTrend(trend: number) {
  if (trend <= -0.3) return `Drying ${Math.abs(trend).toFixed(1)} points this week`
  if (trend >= 0.3) return `Wetting ${trend.toFixed(1)} points this week`
  return 'Steady this week'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  }).format(new Date(`${value}T00:00:00Z`))
}
