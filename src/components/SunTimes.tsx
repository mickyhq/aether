import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import { Box, Typography } from '@mui/material'
import { useI18n } from '../i18n/I18nContext'

type SunTimesProps = {
  sunrise: string | null
  sunset: string | null
}

export function SunTimes({ sunrise, sunset }: SunTimesProps) {
  const { language, t } = useI18n()

  return (
    <Box className="sun-times">
      <SunTime
        icon={<LightModeIcon />}
        label={t('sun.sunrise')}
        value={formatSunTime(sunrise, language)}
      />
      <SunTime
        icon={<DarkModeIcon />}
        label={t('sun.sunset')}
        value={formatSunTime(sunset, language)}
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

function formatSunTime(value: string | null, language: string) {
  if (!value) {
    return '--'
  }

  const date = new Date(value)

  if (!Number.isFinite(date.getTime())) {
    return '--'
  }

  return new Intl.DateTimeFormat(language, {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date)
}
