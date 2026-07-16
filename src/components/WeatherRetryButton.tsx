import RefreshIcon from '@mui/icons-material/Refresh'
import { IconButton, Tooltip } from '@mui/material'
import { useI18n } from '../i18n/I18nContext'

type WeatherRetryButtonProps = {
  visible: boolean
  onRetry: () => void
}

export function WeatherRetryButton({
  visible,
  onRetry
}: WeatherRetryButtonProps) {
  const { t } = useI18n()

  return (
    <span
      className={`weather-retry-slot ${visible ? 'weather-retry-visible' : ''}`}
      aria-hidden={!visible}
    >
      <Tooltip title={t('retry.weather')}>
        <span>
          <IconButton
            className="weather-retry-button"
            aria-label={t('retry.loading')}
            disabled={!visible}
            onClick={onRetry}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </span>
  )
}
