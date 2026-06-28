import AirIcon from '@mui/icons-material/Air'
import DeviceThermostatIcon from '@mui/icons-material/DeviceThermostat'
import ThunderstormIcon from '@mui/icons-material/Thunderstorm'
import WaterDropIcon from '@mui/icons-material/WaterDrop'
import { Box, Chip, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import type { WeatherConfig, WeatherMode } from '../types/weather'

type WeatherDashboardProps = {
  weather: WeatherConfig | null
  status: string
  mode: WeatherMode
  onModeChange: (mode: WeatherMode) => void
}

export function WeatherDashboard({ weather, status, mode, onModeChange }: WeatherDashboardProps) {
  return (
    <Box className="weather-panel">
      <Stack spacing={1.25}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1.5}>
          <Box className="panel-heading">
            <Typography variant="h5" className="panel-title">
              {weather?.zone ?? 'Paris'}
            </Typography>
            <Typography variant="caption" className="panel-subtitle">
              {weather?.description ?? 'Waiting for local atmosphere'}
            </Typography>
          </Box>
          <Chip size="small" label={status} className="status-chip" />
        </Stack>

        <Stack className="metric-grid">
          <Metric
            icon={<DeviceThermostatIcon />}
            label="Temp"
            value={formatTemperature(weather)}
            selected={mode === 'temperature'}
            onClick={() => onModeChange('temperature')}
          />
          <Metric
            icon={<AirIcon />}
            label="Wind"
            value={formatWind(weather)}
            selected={mode === 'wind'}
            onClick={() => onModeChange('wind')}
          />
          <Metric
            icon={<WaterDropIcon />}
            label="Precipitation"
            value={formatPrecipitation(weather)}
            selected={mode === 'precipitation'}
            onClick={() => onModeChange('precipitation')}
          />
          <Metric
            icon={<ThunderstormIcon />}
            label="Storm"
            value={weather?.isThunderstorm ? 'Yes' : 'No'}
            selected={mode === 'storm'}
            onClick={() => onModeChange('storm')}
          />
        </Stack>
      </Stack>
    </Box>
  )
}

function Metric({
  icon,
  label,
  value,
  selected,
  onClick
}: {
  icon: ReactNode
  label: string
  value: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button className={`metric ${selected ? 'metric-selected' : ''}`} onClick={onClick}>
      <Box className="metric-icon">{icon}</Box>
      <Box>
        <Typography variant="caption" className="metric-label">
          {label}
        </Typography>
        <Typography variant="body2" className="metric-value">
          {value}
        </Typography>
      </Box>
    </button>
  )
}

function formatTemperature(weather: WeatherConfig | null) {
  return weather ? `${Math.round(weather.temperature)}°C` : '--'
}

function formatWind(weather: WeatherConfig | null) {
  return weather ? `${Math.round(weather.rawWindSpeed)} km/h` : '--'
}

function formatPrecipitation(weather: WeatherConfig | null) {
  return weather ? `${weather.precipitation.toFixed(1)} mm` : '--'
}
