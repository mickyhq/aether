import TuneIcon from '@mui/icons-material/Tune'
import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import type { AnimationQuality } from '../types/weather'
import { useI18n } from '../i18n/I18nContext'

type AnimationQualityControlProps = {
  quality: AnimationQuality
  onChange: (quality: AnimationQuality) => void
}

const QUALITY_OPTIONS: AnimationQuality[] = ['low', 'balanced', 'high']
const QUALITY_LABEL_KEYS = {
  low: 'quality.low',
  balanced: 'quality.balanced',
  high: 'quality.high'
} as const

export function AnimationQualityControl({
  quality,
  onChange
}: AnimationQualityControlProps) {
  const { t } = useI18n()

  return (
    <Box className="animation-quality-control">
      <Box className="animation-quality-heading">
        <TuneIcon />
        <Typography variant="caption">{t('quality.title')}</Typography>
      </Box>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={quality}
        aria-label={t('quality.title')}
        onChange={(_, value: AnimationQuality | null) => {
          if (value) {
            onChange(value)
          }
        }}
      >
        {QUALITY_OPTIONS.map(option => {
          const label = t(QUALITY_LABEL_KEYS[option])

          return (
            <ToggleButton
              key={option}
              value={option}
              aria-label={t('quality.aria', { quality: label })}
            >
              {label}
            </ToggleButton>
          )
        })}
      </ToggleButtonGroup>
    </Box>
  )
}
