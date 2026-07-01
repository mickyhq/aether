import { Typography } from '@mui/material'

type ForecastDateLabelProps = {
  time: string | null
}

export function ForecastDateLabel({ time }: ForecastDateLabelProps) {
  if (!time) {
    return null
  }

  return (
    <Typography
      className="forecast-date-label"
      aria-label="Forecast date"
      aria-live="polite"
    >
      Forecast · {formatForecastDate(time)}
    </Typography>
  )
}

function formatForecastDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}
