import { Typography } from '@mui/material'
import { useI18n } from '../i18n/I18nContext'

type ForecastDateLabelProps = {
  time: string | null
}

export function ForecastDateLabel({ time }: ForecastDateLabelProps) {
  const { language, t } = useI18n()

  if (!time) {
    return null
  }

  return (
    <Typography
      className="forecast-date-label"
      aria-label={t('forecast.dateAria')}
      aria-live="polite"
    >
      {t('forecast.date', { date: formatForecastDate(time, language) })}
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
