import AirIcon from '@mui/icons-material/Air'
import BlurOnIcon from '@mui/icons-material/BlurOn'
import DeviceThermostatIcon from '@mui/icons-material/DeviceThermostat'
import ThunderstormIcon from '@mui/icons-material/Thunderstorm'
import WaterDropIcon from '@mui/icons-material/WaterDrop'
import { Box, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import type { AirQualityReading, WeatherConfig, WeatherEvolutionFrame, WeatherMode } from '../types/weather'
import { SevereWeatherAlerts } from './SevereWeatherAlerts'

type WeatherDashboardProps = {
  weather: WeatherConfig | null
  airQuality: AirQualityReading | null
  mode: WeatherMode
  onModeChange: (mode: WeatherMode) => void
}

export function WeatherDashboard({
  weather,
  airQuality,
  mode,
  onModeChange
}: WeatherDashboardProps) {
  return (
    <Box className="weather-panel">
      <Stack spacing={1.25}>
        <SevereWeatherAlerts weather={weather} />
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
          <Metric
            icon={<BlurOnIcon />}
            label="Air quality"
            value={formatAirQuality(airQuality)}
            selected={mode === 'air-quality'}
            onClick={() => onModeChange('air-quality')}
          />
        </Stack>

        <HourlyForecast frames={weather?.evolution ?? []} />
      </Stack>
    </Box>
  )
}

function HourlyForecast({ frames }: { frames: WeatherEvolutionFrame[] }) {
  const visibleFrames = frames.slice(0, 12)

  if (visibleFrames.length === 0) {
    return (
      <Box className="hourly-forecast">
        <Typography variant="caption" className="hourly-forecast-label">
          12-hour forecast
        </Typography>
        <Box className="hourly-forecast-empty">
          Forecast unavailable
        </Box>
      </Box>
    )
  }

  const chartHeight = 52
  const chartWidth = visibleFrames.length * 24

  const temperatures = visibleFrames.map(f => f.temperature)
  const minTemp = Math.min(...temperatures)
  const maxTemp = Math.max(...temperatures)
  const tempRange = maxTemp - minTemp || 1

  const precipitations = visibleFrames.map(f => f.precipitation)
  const maxPrecip = Math.max(...precipitations, 0.5)

  const tempPoints = visibleFrames
    .map((frame, index) => {
      const x = index * 24 + 12
      const y = 8 + (1 - (frame.temperature - minTemp) / tempRange) * (chartHeight - 24)
      return `${x},${y}`
    })
    .join(' ')

  const precipBars = visibleFrames
    .map((frame, index) => {
      const barHeight = Math.max(0, (frame.precipitation / maxPrecip) * (chartHeight - 16))
      const x = index * 24
      return barHeight > 0
        ? `<rect x="${x + 6}" y="${chartHeight - barHeight}" width="12" height="${barHeight}" rx="2" fill="rgba(90,170,255,0.35)" />`
        : ''
    })
    .join('')

  const timeLabels = visibleFrames
    .map((frame, index) => {
      if (index % 3 !== 0) return ''
      const hour = new Date(frame.time).getHours()
      const x = index * 24 + 12
      return `<text x="${x}" y="${chartHeight + 14}" text-anchor="middle" fill="rgba(230,247,255,0.55)" font-size="9" font-weight="600">${hour}h</text>`
    })
    .join('')

  return (
    <Box className="hourly-forecast">
      <Typography variant="caption" className="hourly-forecast-label">
        12-hour forecast
      </Typography>
      <Box className="hourly-forecast-chart">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight + 22}`}
          width={chartWidth}
          height={chartHeight + 22}
          preserveAspectRatio="xMinYMid meet"
          aria-label="12-hour temperature and precipitation forecast"
        >
          <defs>
            <linearGradient id="forecast-temp-line" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8fe5ff" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#ff955f" stopOpacity="0.7" />
            </linearGradient>
            <linearGradient id="forecast-temp-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8fe5ff" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#ff955f" stopOpacity="0.06" />
            </linearGradient>
          </defs>

          {/* Precipitation bars */}
          <g dangerouslySetInnerHTML={{ __html: precipBars }} />

          {/* Temperature area fill */}
          <polygon
            points={`0,${chartHeight} ${tempPoints} ${chartWidth},${chartHeight}`}
            fill="url(#forecast-temp-fill)"
          />

          {/* Temperature line */}
          <polyline
            points={tempPoints}
            fill="none"
            stroke="url(#forecast-temp-line)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Temperature dots */}
          {visibleFrames.map((frame, index) => {
            const x = index * 24 + 12
            const y = 8 + (1 - (frame.temperature - minTemp) / tempRange) * (chartHeight - 24)
            return (
              <circle
                key={index}
                cx={x}
                cy={y}
                r="2.5"
                fill="#f7fcff"
                stroke="#071014"
                strokeWidth="0.8"
              />
            )
          })}

          {/* Time labels */}
          <g dangerouslySetInnerHTML={{ __html: timeLabels }} />

          {/* High / low labels */}
          <text
            x="2"
            y="10"
            fill="rgba(230,247,255,0.62)"
            font-size="9"
            font-weight="700"
          >
            {Math.round(maxTemp)}°
          </text>
          <text
            x="2"
            y={chartHeight - 4}
            fill="rgba(230,247,255,0.48)"
            font-size="9"
            font-weight="600"
          >
            {Math.round(minTemp)}°
          </text>
        </svg>
      </Box>
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

function formatAirQuality(airQuality: AirQualityReading | null) {
  return airQuality ? `AQI ${Math.round(airQuality.europeanAqi)}` : '--'
}
