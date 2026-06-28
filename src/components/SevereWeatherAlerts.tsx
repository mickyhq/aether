import { Alert, AlertTitle, Stack } from '@mui/material'
import { useState } from 'react'
import type { HeatAlert, WeatherConfig } from '../types/weather'

const THUNDERSTORM_CODES = new Set([95, 96, 99])
const HEAVY_RAIN_CODES = new Set([65, 67, 82])
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86])
const HEAVY_RAIN_THRESHOLD = 7.5
const SNOW_THRESHOLD = 0.5

type SevereAlert = {
  id: string
  severity: 'error' | 'warning'
  title: string
  message: string
}

export function SevereWeatherAlerts({
  weather,
  officialHeatAlerts
}: {
  weather: WeatherConfig | null
  officialHeatAlerts: HeatAlert[]
}) {
  const alerts = getSevereWeatherAlerts(weather, officialHeatAlerts)
  const signature = [
    weather?.zone,
    weather?.weatherCode,
    weather?.precipitation.toFixed(1),
    weather?.snowfall.toFixed(1),
    ...alerts.map(alert => `${alert.id}:${alert.message}`)
  ].join(':')
  const [dismissed, setDismissed] = useState<{
    signature: string
    ids: string[]
  }>({
    signature: '',
    ids: []
  })
  const dismissedIds = dismissed.signature === signature ? dismissed.ids : []
  const visibleAlerts = alerts.filter(alert => !dismissedIds.includes(alert.id))

  if (visibleAlerts.length === 0) {
    return null
  }

  function dismiss(alertId: string) {
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
  weather: WeatherConfig | null,
  officialHeatAlerts: HeatAlert[] = []
): SevereAlert[] {
  if (!weather) {
    return []
  }

  const alerts: SevereAlert[] = []

  for (const alert of officialHeatAlerts) {
    alerts.push({
      id: `official-heat:${alert.id}`,
      severity: alert.severity,
      title: alert.title,
      message: `${alert.message} Source: ${alert.source}.`
    })
  }

  if (officialHeatAlerts.length === 0 && weather.heatRisk) {
    const heatRisk = weather.heatRisk
    const isHeatWave = heatRisk.kind === 'heat-wave'

    alerts.push({
      id: `forecast-${heatRisk.kind}`,
      severity: heatRisk.maximumTemperature >= 40 ? 'error' : 'warning',
      title: isHeatWave ? 'Heat wave forecast' : 'Extreme heat forecast',
      message: isHeatWave
        ? `${heatRisk.days} hot days forecast, reaching ${Math.round(heatRisk.maximumTemperature)}°C. Stay hydrated and avoid peak heat.`
        : `Temperatures may reach ${Math.round(heatRisk.maximumTemperature)}°C. Stay hydrated and avoid peak heat.`
    })
  }

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
