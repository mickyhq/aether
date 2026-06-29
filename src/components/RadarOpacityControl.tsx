import OpacityIcon from '@mui/icons-material/Opacity'
import { Box, Slider, Typography } from '@mui/material'
import type { WeatherMode } from '../types/weather'

type RadarOpacityControlProps = {
  mode: WeatherMode
  opacity: number
  onChange: (opacity: number) => void
}

export function RadarOpacityControl({
  mode,
  opacity,
  onChange
}: RadarOpacityControlProps) {
  if (mode !== 'precipitation' && mode !== 'storm') {
    return null
  }

  return (
    <Box className="radar-opacity-control">
      <Box className="radar-opacity-heading">
        <OpacityIcon />
        <Typography variant="caption">Radar</Typography>
        <Typography variant="caption">
          {Math.round(opacity * 100)}%
        </Typography>
      </Box>
      <Slider
        size="small"
        min={0}
        max={1}
        step={0.05}
        value={opacity}
        aria-label="Radar opacity"
        onChange={(_, value) => onChange(value as number)}
      />
    </Box>
  )
}
