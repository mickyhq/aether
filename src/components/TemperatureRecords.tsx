import AcUnitIcon from '@mui/icons-material/AcUnit'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import { Box, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { fetchTemperatureRecords } from '../services/temperatureRecords'
import type { TemperatureRecords as TemperatureRecordsData, WeatherLocation } from '../types/weather'
import { usePageVisibility } from '../hooks/usePageVisibility'
import { useI18n } from '../i18n/I18nContext'

export function TemperatureRecords({ location }: { location: WeatherLocation | null }) {
  const [records, setRecords] = useState<TemperatureRecordsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const pageVisible = usePageVisibility()
  const { language, t } = useI18n()

  useEffect(() => {
    if (!location) {
      setRecords(null)
      return
    }

    if (!pageVisible) {
      return
    }

    const controller = new AbortController()

    setRecords(null)
    setUnavailable(false)
    setLoading(true)

    void fetchTemperatureRecords(location, controller.signal)
      .then(setRecords)
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
    <Box className="temperature-records" aria-live="polite">
      <Box className="temperature-records-heading">
        <Typography variant="caption">{t('records.title')}</Typography>
        <Typography variant="caption">ERA5-Land · 11 km</Typography>
      </Box>

      {loading && <Box className="temperature-records-status">{t('records.reading')}</Box>}
      {unavailable && <Box className="temperature-records-status">{t('records.unavailable')}</Box>}

      {records && (
        <>
          <Box className="temperature-record-values">
            <RecordValue
              icon={<AcUnitIcon />}
              label={t('records.lowest')}
              temperature={records.lowest.temperature}
              date={records.lowest.date}
              kind="low"
              language={language}
            />
            <RecordValue
              icon={<LocalFireDepartmentIcon />}
              label={t('records.highest')}
              temperature={records.highest.temperature}
              date={records.highest.date}
              kind="high"
              language={language}
            />
          </Box>
          <Typography variant="caption" className="temperature-records-period">
            {t('records.period', {
              start: formatYear(records.period.start),
              end: formatYear(records.period.end)
            })}
          </Typography>
        </>
      )}
    </Box>
  )
}

function RecordValue({
  icon,
  label,
  temperature,
  date,
  kind,
  language
}: {
  icon: React.ReactNode
  label: string
  temperature: number
  date: string
  kind: 'low' | 'high'
  language: string
}) {
  return (
    <Box className={`temperature-record is-${kind}`}>
      {icon}
      <Box>
        <Typography variant="caption">{label}</Typography>
        <Typography variant="body2">{temperature.toFixed(1)}°C</Typography>
        <Typography variant="caption">{formatDate(date, language)}</Typography>
      </Box>
    </Box>
  )
}

function formatDate(value: string, language: string) {
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${value}T00:00:00Z`))
}

function formatYear(value: string) {
  return value.slice(0, 4)
}
