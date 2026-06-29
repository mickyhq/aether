import RefreshIcon from '@mui/icons-material/Refresh'
import { IconButton, Tooltip } from '@mui/material'

type WeatherRetryButtonProps = {
  visible: boolean
  onRetry: () => void
}

export function WeatherRetryButton({
  visible,
  onRetry
}: WeatherRetryButtonProps) {
  return (
    <span
      className={`weather-retry-slot ${visible ? 'weather-retry-visible' : ''}`}
      aria-hidden={!visible}
    >
      <Tooltip title="Retry weather">
        <span>
          <IconButton
            className="weather-retry-button"
            aria-label="Retry weather loading"
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
