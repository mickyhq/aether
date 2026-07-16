import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import { Box, Typography } from '@mui/material'
import { useI18n } from '../i18n/I18nContext'

type SunTimesProps = {
  sunrise: string | null
  sunset: string | null
}

export function SunTimes({ sunrise, sunset }: SunTimesProps) {
  const { t } = useI18n()

  return (
    <Box className="sun-times">
      <SunTime
        icon={<LightModeIcon />}
        label={t('sun.sunrise')}
        value={formatSunTime(sunrise)}
      />
      <SunTime
        icon={<DarkModeIcon />}
        label={t('sun.sunset')}
        value={formatSunTime(sunset)}
      />
    </Box>
  )
}

type SunTimeProps = {
  icon: React.ReactNode
  label: string
  value: string
}

function SunTime({ icon, label, value }: SunTimeProps) {
  return (
    <Box className="sun-time">
      {icon}
      <Box>
        <Typography variant="caption">{label}</Typography>
        <Typography variant="body2">{value}</Typography>
      </Box>
    </Box>
  )
}

function formatSunTime(value: string | null) {
  if (!value) {
    return '--'
  }

  const time = value.split('T')[1]

  return time?.slice(0, 5) || '--'
}
