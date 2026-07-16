import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { IconButton } from '@mui/material'
import { useI18n } from '../i18n/I18nContext'

type WeatherPanelToggleProps = {
  collapsed: boolean
  onToggle: () => void
}

export function WeatherPanelToggle({
  collapsed,
  onToggle
}: WeatherPanelToggleProps) {
  const { t } = useI18n()
  const label = t(collapsed ? 'panel.show' : 'panel.hide')

  return (
    <IconButton
      className={`weather-panel-toggle ${collapsed ? 'is-collapsed' : ''}`}
      aria-label={label}
      aria-controls="weather-panel"
      aria-expanded={!collapsed}
      title={label}
      onClick={onToggle}
    >
      {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
    </IconButton>
  )
}
