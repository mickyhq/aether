import { Typography } from '@mui/material'
import { useI18n } from '../i18n/I18nContext'

type ForecastDateLabelProps = {
  time: string | null
  kind?: 'forecast' | 'radar'
}

export function ForecastDateLabel({
  time,
  kind = 'forecast'
}: ForecastDateLabelProps) {
  const { language, t } = useI18n()

  if (!time) {
    return null
  }

  return (
    <Typography
      className="forecast-date-label"
      aria-label={t(kind === 'radar' ? 'radar.dateAria' : 'forecast.dateAria')}
      aria-live="polite"
    >
      {t(kind === 'radar' ? 'radar.date' : 'forecast.date', {
        date: formatForecastDate(time, language)
      })}
    </Typography>
  )
}

function formatForecastDate(value: string, language: string) {
  return new Intl.DateTimeFormat(language, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}
