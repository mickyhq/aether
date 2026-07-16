import GrassIcon from '@mui/icons-material/Grass'
import WaterDropIcon from '@mui/icons-material/WaterDrop'
import { Box, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { fetchSoilMoisture } from '../services/soilMoisture'
import type { SoilMoistureReading, WeatherLocation } from '../types/weather'
import { usePageVisibility } from '../hooks/usePageVisibility'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'

const DROUGHT_KEYS: Record<string, TranslationKey> = {
  'Exceptional drought': 'drought.exceptional',
  'Extreme drought': 'drought.extreme',
  'Severe drought': 'drought.severe',
  Dry: 'drought.dry',
  'Dry watch': 'drought.watch',
  Wet: 'drought.wet',
  'Near normal': 'drought.normal'
}

export function SoilMoisture({ location }: { location: WeatherLocation | null }) {
  const [reading, setReading] = useState<SoilMoistureReading | null>(null)
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const pageVisible = usePageVisibility()
  const { language, t } = useI18n()

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
        <Typography variant="caption">{t('soil.title')}</Typography>
        <Typography variant="caption">ERA5-Land · 11 km</Typography>
      </Box>

      {loading && <Box className="soil-moisture-status">{t('soil.reading')}</Box>}
      {unavailable && <Box className="soil-moisture-status">{t('soil.unavailable')}</Box>}

      {reading && (
        <>
          <Box className="soil-moisture-summary">
            <Box className={`soil-moisture-category ${getCategoryClass(reading.percentile)}`}>
              <GrassIcon />
              <Box>
                <Typography variant="body2">
                  {t(DROUGHT_KEYS[reading.category] ?? 'drought.normal')}
                </Typography>
                <Typography variant="caption">
                  {t('soil.percentile', { value: reading.percentile })}
                </Typography>
              </Box>
            </Box>
            <Box className="soil-moisture-values">
              <span><WaterDropIcon />{t('soil.root', { value: reading.rootZonePercent.toFixed(1) })}</span>
              <span>{t('soil.surface', { value: reading.surfacePercent.toFixed(1) })}</span>
            </Box>
          </Box>

          <Box className="soil-moisture-scale" aria-label={t('soil.aria', { value: reading.percentile })}>
            <span style={{ left: `${Math.max(1, Math.min(99, reading.percentile))}%` }} />
          </Box>

          <Typography variant="caption" className="soil-moisture-detail">
            {t('soil.updated', {
              trend: formatTrend(reading.trend, t),
              date: formatDate(reading.date, language)
            })}
          </Typography>
          <Typography variant="caption" className="soil-moisture-note">
            {t('soil.note', { baseline: reading.baseline })}
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

function formatTrend(trend: number, t: ReturnType<typeof useI18n>['t']) {
  if (trend <= -0.3) return t('soil.drying', { value: Math.abs(trend).toFixed(1) })
  if (trend >= 0.3) return t('soil.wetting', { value: trend.toFixed(1) })
  return t('soil.steady')
}

function formatDate(value: string, language: string) {
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  }).format(new Date(`${value}T00:00:00Z`))
}
