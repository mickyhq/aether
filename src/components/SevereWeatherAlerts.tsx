import { Alert, AlertTitle, Stack } from '@mui/material'
import { useState } from 'react'
import type { HeatAlert, WeatherConfig } from '../types/weather'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'

const THUNDERSTORM_CODES = new Set([95, 96, 99])
const HEAVY_RAIN_CODES = new Set([65, 67, 82])
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86])
const HEAVY_RAIN_THRESHOLD = 7.5
const SNOW_THRESHOLD = 0.5

type SevereAlert = {
  id: string
  severity: 'error' | 'warning'
  title: TranslationKey | string
  message: TranslationKey | string
  values?: Record<string, string | number>
  translated?: boolean
}

export function SevereWeatherAlerts({
  weather,
  officialHeatAlerts
}: {
  weather: WeatherConfig | null
  officialHeatAlerts: HeatAlert[]
}) {
  const { t } = useI18n()
  const alerts = getSevereWeatherAlerts(weather, officialHeatAlerts, t)
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
    <Stack spacing={0.75} aria-label={t('alert.aria')}>
      {visibleAlerts.map(alert => (
        <Alert
          key={alert.id}
          severity={alert.severity}
          variant="outlined"
          className="severe-weather-alert"
          onClose={() => dismiss(alert.id)}
        >
          <AlertTitle>
            {alert.translated ? alert.title : t(alert.title as TranslationKey, alert.values)}
          </AlertTitle>
          {alert.translated ? alert.message : t(alert.message as TranslationKey, alert.values)}
        </Alert>
      ))}
    </Stack>
  )
}

export function getSevereWeatherAlerts(
  weather: WeatherConfig | null,
  officialHeatAlerts: HeatAlert[] = [],
  translate: (
    key: TranslationKey,
    values?: Record<string, string | number>
  ) => string = defaultTranslate
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
      message: translate('alert.source', {
        message: alert.message,
        source: alert.source
      }),
      translated: true
    })
  }

  if (officialHeatAlerts.length === 0 && weather.heatRisk) {
    const heatRisk = weather.heatRisk
    const isHeatWave = heatRisk.kind === 'heat-wave'
    const isExtremeHeat = heatRisk.kind === 'extreme-heat'

    alerts.push({
      id: `forecast-${heatRisk.kind}`,
      severity: heatRisk.maximumTemperature >= 40 ? 'error' : 'warning',
      title: isHeatWave
        ? 'alert.heatWave'
        : isExtremeHeat
          ? 'alert.extremeHeat'
          : 'alert.highHeat',
      message: isHeatWave
        ? 'alert.heatWaveMessage'
        : isExtremeHeat
          ? 'alert.heatMessage'
          : 'alert.highHeatMessage',
      values: {
        days: heatRisk.days,
        temperature: Math.round(heatRisk.maximumTemperature)
      }
    })
  }

  if (
    weather.isThunderstorm ||
    THUNDERSTORM_CODES.has(weather.weatherCode)
  ) {
    alerts.push({
      id: 'thunderstorm',
      severity: 'error',
      title: 'alert.thunderstorm',
      message: 'alert.thunderstormMessage'
    })
  }

  if (
    HEAVY_RAIN_CODES.has(weather.weatherCode) ||
    weather.precipitation >= HEAVY_RAIN_THRESHOLD
  ) {
    alerts.push({
      id: 'heavy-rain',
      severity: 'warning',
      title: 'alert.heavyRain',
      message: 'alert.heavyRainMessage',
      values: { amount: weather.precipitation.toFixed(1) }
    })
  }

  if (
    SNOW_CODES.has(weather.weatherCode) ||
    weather.snowfall >= SNOW_THRESHOLD
  ) {
    alerts.push({
      id: 'snow',
      severity: 'warning',
      title: 'alert.snow',
      message: 'alert.snowMessage'
    })
  }

  return alerts
}

function defaultTranslate(
  key: TranslationKey,
  values: Record<string, string | number> = {}
) {
  if (key === 'alert.source') {
    return `${values.message} Source: ${values.source}.`
  }

  return key
}
