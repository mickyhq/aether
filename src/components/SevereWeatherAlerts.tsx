import { Alert, AlertTitle, Stack } from '@mui/material'
import { useState } from 'react'
import type { WeatherConfig } from '../types/weather'

const THUNDERSTORM_CODES = new Set([95, 96, 99])
const HEAVY_RAIN_CODES = new Set([65, 67, 82])
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86])
const HEAVY_RAIN_THRESHOLD = 7.5
const SNOW_THRESHOLD = 0.5

type SevereAlert = {
  id: 'thunderstorm' | 'heavy-rain' | 'snow'
  severity: 'error' | 'warning'
  title: string
  message: string
}

export function SevereWeatherAlerts({ weather }: { weather: WeatherConfig | null }) {
  const alerts = getSevereWeatherAlerts(weather)
  const signature = [
    weather?.zone,
    weather?.weatherCode,
    weather?.precipitation.toFixed(1),
    weather?.snowfall.toFixed(1),
    ...alerts.map(alert => alert.id)
  ].join(':')
  const [dismissed, setDismissed] = useState<{
    signature: string
    ids: SevereAlert['id'][]
  }>({
    signature: '',
    ids: []
  })
  const dismissedIds = dismissed.signature === signature ? dismissed.ids : []
  const visibleAlerts = alerts.filter(alert => !dismissedIds.includes(alert.id))

  if (visibleAlerts.length === 0) {
    return null
  }

  function dismiss(alertId: SevereAlert['id']) {
    setDismissed(current => ({
      signature,
      ids: current.signature === signature
        ? [...current.ids, alertId]
        : [alertId]
    }))
  }

  return (
    <Stack spacing={0.75} aria-label="Severe weather alerts">
      {visibleAlerts.map(alert => (
        <Alert
          key={alert.id}
          severity={alert.severity}
          variant="outlined"
          className="severe-weather-alert"
          onClose={() => dismiss(alert.id)}
        >
          <AlertTitle>{alert.title}</AlertTitle>
          {alert.message}
        </Alert>
      ))}
    </Stack>
  )
}

export function getSevereWeatherAlerts(
  weather: WeatherConfig | null
): SevereAlert[] {
  if (!weather) {
    return []
  }

  const alerts: SevereAlert[] = []

  if (
    weather.isThunderstorm ||
    THUNDERSTORM_CODES.has(weather.weatherCode)
  ) {
    alerts.push({
      id: 'thunderstorm',
      severity: 'error',
      title: 'Thunderstorm',
      message: 'Avoid exposed areas and watch for lightning.'
    })
  }

  if (
    HEAVY_RAIN_CODES.has(weather.weatherCode) ||
    weather.precipitation >= HEAVY_RAIN_THRESHOLD
  ) {
    alerts.push({
      id: 'heavy-rain',
      severity: 'warning',
      title: 'Heavy rain',
      message: `${weather.precipitation.toFixed(1)} mm detected. Watch for flooding.`
    })
  }

  if (
    SNOW_CODES.has(weather.weatherCode) ||
    weather.snowfall >= SNOW_THRESHOLD
  ) {
    alerts.push({
      id: 'snow',
      severity: 'warning',
      title: 'Snow',
      message: 'Roads and paths may be slippery.'
    })
  }

  return alerts
}
