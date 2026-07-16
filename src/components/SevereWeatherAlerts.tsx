import { Alert, AlertTitle, Stack, Typography } from '@mui/material'
import { useState } from 'react'
import type {
  OfficialWarning,
  OfficialWarningsData,
  WarningHazard,
  WeatherConfig
} from '../types/weather'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { OfficialWarningAlert } from './OfficialWarningAlert'

const THUNDERSTORM_CODES = new Set([95, 96, 99])
const HEAVY_RAIN_CODES = new Set([65, 67, 82])
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86])
const HEAVY_RAIN_THRESHOLD = 7.5
const SNOW_THRESHOLD = 0.5

type ForecastNotice = {
  id: string
  severity: 'error' | 'warning'
  title: TranslationKey
  message: TranslationKey
  values?: Record<string, string | number>
}

export function SevereWeatherAlerts({
  weather,
  officialWarnings,
  warningProviders
}: {
  weather: WeatherConfig | null
  officialWarnings: OfficialWarning[]
  warningProviders: OfficialWarningsData['providers']
}) {
  const { t } = useI18n()
  const forecastNotices = getForecastHazardNotices(weather, officialWarnings)
  const signature = [
    weather?.zone,
    weather?.weatherCode,
    weather?.precipitation.toFixed(1),
    weather?.snowfall.toFixed(1),
    ...officialWarnings.map(warning => `${warning.id}:${warning.updatedAt}:${warning.state}`),
    ...forecastNotices.map(notice => notice.id)
  ].join(':')
  const [dismissed, setDismissed] = useState<{
    signature: string
    ids: string[]
  }>({ signature: '', ids: [] })
  const dismissedIds = dismissed.signature === signature ? dismissed.ids : []
  const visibleOfficial = officialWarnings.filter(
    warning => !dismissedIds.includes(`official:${warning.id}`)
  )
  const visibleForecast = forecastNotices.filter(
    notice => !dismissedIds.includes(notice.id)
  )
  const unconfiguredProvider = warningProviders.find(
    provider => provider.status === 'unconfigured'
  )

  if (
    visibleOfficial.length === 0 &&
    visibleForecast.length === 0 &&
    !unconfiguredProvider
  ) {
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
      {visibleOfficial.length > 0 && (
        <Typography className="warning-group-title">
          {t('warning.officialGroup')}
        </Typography>
      )}
      {visibleOfficial.map(warning => (
        <OfficialWarningAlert
          key={warning.id}
          warning={warning}
          onClose={() => dismiss(`official:${warning.id}`)}
        />
      ))}
      {unconfiguredProvider && visibleOfficial.length === 0 && (
        <>
          <Typography className="warning-group-title">
            {t('warning.officialGroup')}
          </Typography>
          <Alert
            severity="info"
            variant="outlined"
            className="severe-weather-alert official-warning-alert"
          >
            {t('warning.unconfigured', { source: unconfiguredProvider.source })}
          </Alert>
        </>
      )}
      {visibleForecast.length > 0 && (
        <Typography className="warning-group-title is-forecast">
          {t('warning.forecastGroup')}
        </Typography>
      )}
      {visibleForecast.map(notice => (
        <Alert
          key={notice.id}
          severity={notice.severity}
          variant="outlined"
          className="severe-weather-alert forecast-notice-alert"
          onClose={() => dismiss(notice.id)}
        >
          <AlertTitle>{t(notice.title, notice.values)}</AlertTitle>
          {t(notice.message, notice.values)}
        </Alert>
      ))}
    </Stack>
  )
}

export function getForecastHazardNotices(
  weather: WeatherConfig | null,
  officialWarnings: OfficialWarning[] = []
): ForecastNotice[] {
  if (!weather) {
    return []
  }

  const officialHazards = new Set<WarningHazard>(
    officialWarnings.map(warning => warning.hazard)
  )
  const notices: ForecastNotice[] = []

  if (!officialHazards.has('extreme-temperature') && weather.heatRisk) {
    const heatRisk = weather.heatRisk
    const isHeatWave = heatRisk.kind === 'heat-wave'
    const isExtremeHeat = heatRisk.kind === 'extreme-heat'

    notices.push({
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
    !officialHazards.has('storm') &&
    (weather.isThunderstorm || THUNDERSTORM_CODES.has(weather.weatherCode))
  ) {
    notices.push({
      id: 'forecast-thunderstorm',
      severity: 'error',
      title: 'alert.thunderstorm',
      message: 'alert.thunderstormMessage'
    })
  }

  if (
    !officialHazards.has('flood') &&
    (HEAVY_RAIN_CODES.has(weather.weatherCode) ||
      weather.precipitation >= HEAVY_RAIN_THRESHOLD)
  ) {
    notices.push({
      id: 'forecast-heavy-rain',
      severity: 'warning',
      title: 'alert.heavyRain',
      message: 'alert.heavyRainMessage',
      values: { amount: weather.precipitation.toFixed(1) }
    })
  }

  if (
    !officialHazards.has('snow') &&
    (SNOW_CODES.has(weather.weatherCode) || weather.snowfall >= SNOW_THRESHOLD)
  ) {
    notices.push({
      id: 'forecast-snow',
      severity: 'warning',
      title: 'alert.snow',
      message: 'alert.snowMessage'
    })
  }

  return notices
}
