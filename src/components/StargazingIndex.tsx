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
import { usePageVisibility } from '../hooks/usePageVisibility'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'

const RATING_KEYS: Record<string, TranslationKey> = {
  Excellent: 'rating.excellent',
  Good: 'rating.good',
  Fair: 'rating.fair',
  Poor: 'rating.poor',
  Bad: 'rating.bad'
}
const MOON_KEYS: Record<string, TranslationKey> = {
  'New moon': 'moon.new',
  'Waxing crescent': 'moon.waxingCrescent',
  'First quarter': 'moon.firstQuarter',
  'Waxing gibbous': 'moon.waxingGibbous',
  'Full moon': 'moon.full',
  'Waning gibbous': 'moon.waningGibbous',
  'Last quarter': 'moon.lastQuarter',
  'Waning crescent': 'moon.waningCrescent'
}

export function StargazingIndex({ location }: { location: WeatherLocation | null }) {
  const [forecast, setForecast] = useState<StargazingForecast | null>(null)
  const [nightIndex, setNightIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const pageVisible = usePageVisibility()
  const { language, t } = useI18n()

  useEffect(() => {
    if (!location) {
      setForecast(null)
      return
    }

    if (!pageVisible) {
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
  }, [location, pageVisible])

  if (!location) return null

  const night = forecast?.nights[nightIndex]

  return (
    <Box className="stargazing-index" aria-live="polite">
      <Box className="stargazing-heading">
        <Box>
          <NightsStayIcon />
          <Typography variant="caption">{t('stars.title')}</Typography>
        </Box>
        <Typography variant="caption">{t('stars.subtitle')}</Typography>
      </Box>

      {loading && <Typography variant="caption">{t('stars.reading')}</Typography>}
      {unavailable && <Typography variant="caption">{t('stars.unavailable')}</Typography>}
      {forecast && forecast.nights.length === 0 && (
        <Typography variant="caption">{t('stars.noWindow')}</Typography>
      )}

      {forecast && forecast.nights.length > 0 && (
        <>
          <Box className="stargazing-nights" role="tablist" aria-label={t('stars.nightAria')}>
            {forecast.nights.map((item, index) => (
              <button
                key={item.date}
                role="tab"
                aria-selected={nightIndex === index}
                className={nightIndex === index ? 'is-selected' : ''}
                onClick={() => setNightIndex(index)}
              >
                {formatNight(item.date, language)}
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
                <span>{t(RATING_KEYS[night.rating] ?? 'rating.fair')}</span>
              </Box>
              <Box className="stargazing-factors">
                <Factor icon={<CloudIcon />} label={t('stars.cloud', { value: night.cloudCover })} />
                <Factor icon={<VisibilityIcon />} label={t('stars.seeing', { value: night.seeingArcseconds.toFixed(1) })} />
                <Factor icon={<VisibilityIcon />} label={`${night.transparency.toFixed(2)} mag/airmass`} />
                <Factor
                  icon={<Brightness2Icon />}
                  label={t('stars.moon', {
                    value: night.moonIllumination,
                    phase: t(MOON_KEYS[night.moonPhase] ?? 'moon.new')
                  })}
                />
                <Factor
                  icon={<NightsStayIcon />}
                  label={forecast.lightPollution
                    ? t('stars.bortle', { value: forecast.lightPollution.estimatedBortle })
                    : t('stars.lightUnavailable')}
                />
              </Box>
            </Box>
          )}

          {night && (
            <Typography variant="caption" className="stargazing-best-time">
              {t('stars.bestTime', { time: formatUtcTime(night, language) })}
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

function formatNight(value: string, language: string) {
  return new Intl.DateTimeFormat(language, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  }).format(new Date(`${value}T12:00:00Z`))
}

function formatUtcTime(night: StargazingNight, language: string) {
  return new Intl.DateTimeFormat(language, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC'
  }).format(new Date(night.bestTime)) + ' UTC'
}
