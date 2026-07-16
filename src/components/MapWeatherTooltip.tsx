import AirIcon from '@mui/icons-material/Air'
import BlurOnIcon from '@mui/icons-material/BlurOn'
import DeviceThermostatIcon from '@mui/icons-material/DeviceThermostat'
import FlightIcon from '@mui/icons-material/Flight'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import LocationOnIcon from '@mui/icons-material/LocationOn'
import RadarIcon from '@mui/icons-material/Radar'
import WaterDropIcon from '@mui/icons-material/WaterDrop'
import WavesIcon from '@mui/icons-material/Waves'
import type { MapWeatherPointer } from '../types/weather'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { DataProvenance } from './DataProvenance'

type MapWeatherTooltipProps = {
  reading: MapWeatherPointer | null
}

export function MapWeatherTooltip({ reading }: MapWeatherTooltipProps) {
  const { t } = useI18n()

  if (!reading) {
    return null
  }

  return (
    <aside
      className="map-weather-tooltip"
      style={{
        left: reading.screenX,
        top: reading.screenY
      }}
      aria-live="polite"
    >
      {reading.placeLabel && (
        <div className="map-weather-tooltip-place">
          <LocationOnIcon />
          <strong>{reading.placeLabel}</strong>
        </div>
      )}

      <span className="map-weather-tooltip-coordinates">
        {reading.latitude.toFixed(3)}, {reading.longitude.toFixed(3)}
      </span>

      <div className="map-weather-tooltip-row">
        <DeviceThermostatIcon />
        <span>{Math.round(reading.temperature)}°C</span>
      </div>

      {reading.normalTemperature !== undefined && reading.temperatureAnomaly !== undefined && (
        <div className="map-weather-tooltip-anomaly">
          <span>
            {t('map.normalTemperature', {
              temperature: reading.normalTemperature.toFixed(1)
            })}
          </span>
          <strong>
            {t('map.temperatureDifference', {
              difference: formatAnomaly(reading.temperatureAnomaly)
            })}
          </strong>
          {reading.temperatureBaseline && (
            <span>{t('map.temperatureBaseline', { baseline: reading.temperatureBaseline })}</span>
          )}
        </div>
      )}

      {reading.oceanCurrentSpeed !== undefined && reading.oceanCurrentAngle !== undefined && (
        <div className="map-weather-tooltip-ocean">
          <div className="map-weather-tooltip-row">
            <WavesIcon />
            <span>
              {t('map.current', {
                speed: reading.oceanCurrentSpeed.toFixed(2),
                direction: formatWindDirection(reading.oceanCurrentAngle)
              })}
            </span>
          </div>
          {reading.seaSurfaceTemperature !== undefined && (
            <span>
              {t('map.sea', { temperature: reading.seaSurfaceTemperature.toFixed(1) })}
              {reading.seaSurfaceTemperatureAnomaly !== undefined && (
                ` · ${t('map.anomaly', { value: formatAnomaly(reading.seaSurfaceTemperatureAnomaly) })}`
              )}
            </span>
          )}
        </div>
      )}

      {reading.jetStreamSpeed !== undefined && reading.jetStreamAngle !== undefined && (
        <div className="map-weather-tooltip-row">
          <FlightIcon />
          <span>
            {t('map.jet', {
              speed: Math.round(reading.jetStreamSpeed),
              direction: formatWindDirection(reading.jetStreamAngle)
            })}
          </span>
        </div>
      )}

      <div className="map-weather-tooltip-row">
        <AirIcon />
        <span>
          {Math.round(reading.rawWindSpeed)} km/h {formatWindDirection(reading.windAngle)}
        </span>
      </div>

      <div className="map-weather-tooltip-row">
        <WaterDropIcon />
        <span>{reading.precipitation.toFixed(1)} mm</span>
      </div>

      {reading.radarRain && (
        <div className={`map-weather-tooltip-radar is-${reading.radarRain.status}`}>
          <div className="map-weather-tooltip-row">
            <RadarIcon />
            <strong>{t(formatRadarRainKey(reading.radarRain))}</strong>
          </div>
          {reading.radarRain.observedAt && (
            <span>
              {t('map.latestRadar', {
                age: formatRadarAge(reading.radarRain.observedAt, t)
              })}
            </span>
          )}
        </div>
      )}

      {reading.europeanAqi !== undefined && (
        <div className="map-weather-tooltip-row">
          <BlurOnIcon />
          <span>
            AQI {Math.round(reading.europeanAqi)} · PM2.5 {reading.pm2_5?.toFixed(1)} µg/m³
          </span>
        </div>
      )}

      {reading.fire && (
        <div className="map-weather-tooltip-fire">
          <div className="map-weather-tooltip-row">
            <LocalFireDepartmentIcon />
            <strong>{reading.fire.title}</strong>
          </div>
          <span>{reading.fire.source}</span>
          <span>{reading.fire.detail}</span>
        </div>
      )}

      <DataProvenance value={reading.provenance} compact />
    </aside>
  )
}

function formatWindDirection(angle: number) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const degrees = angle * 180 / Math.PI
  const index = Math.round(degrees / 45) % directions.length

  return directions[index]
}

function formatAnomaly(anomaly: number) {
  return `${anomaly >= 0 ? '+' : ''}${anomaly.toFixed(1)}°C`
}

function formatRadarRainKey(
  reading: NonNullable<MapWeatherPointer['radarRain']>
): TranslationKey {
  if (reading.status === 'checking') {
    return 'map.radarChecking'
  }

  if (reading.status === 'rain') {
    return 'map.radarRain'
  }

  if (reading.status === 'dry') {
    return 'map.radarDry'
  }

  if (reading.status === 'no-coverage') {
    return 'map.radarNoCoverage'
  }

  return 'map.radarUnavailable'
}

function formatRadarAge(
  observedAt: string,
  t: (key: TranslationKey, values?: Record<string, string | number>) => string
) {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - Date.parse(observedAt)) / 60000)
  )

  return minutes < 1
    ? t('map.justNow')
    : t('map.minutesAgo', { minutes })
}
