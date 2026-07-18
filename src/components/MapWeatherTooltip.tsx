import AirIcon from '@mui/icons-material/Air'
import BlurOnIcon from '@mui/icons-material/BlurOn'
import CloseIcon from '@mui/icons-material/Close'
import DeviceThermostatIcon from '@mui/icons-material/DeviceThermostat'
import FlightIcon from '@mui/icons-material/Flight'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import LandscapeIcon from '@mui/icons-material/Landscape'
import LocationOnIcon from '@mui/icons-material/LocationOn'
import RadarIcon from '@mui/icons-material/Radar'
import SensorsIcon from '@mui/icons-material/Sensors'
import WaterDropIcon from '@mui/icons-material/WaterDrop'
import WavesIcon from '@mui/icons-material/Waves'
import { useLayoutEffect, useRef } from 'react'
import type { MapWeatherPointer } from '../types/weather'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { DataProvenance } from './DataProvenance'

type MapWeatherTooltipProps = {
  reading: MapWeatherPointer | null
  onClose: () => void
}

export function MapWeatherTooltip({ reading, onClose }: MapWeatherTooltipProps) {
  const { t } = useI18n()
  const tooltipRef = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current

    if (!reading || !tooltip) {
      return
    }

    const updatePosition = () => {
      const margin = 12
      const bounds = tooltip.getBoundingClientRect()
      const left = Math.max(
        margin,
        Math.min(reading.screenX, window.innerWidth - bounds.width - margin)
      )
      const top = Math.max(
        margin,
        Math.min(reading.screenY, window.innerHeight - bounds.height - margin)
      )

      tooltip.style.left = `${left}px`
      tooltip.style.top = `${top}px`
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('resize', updatePosition)
    }
  }, [reading])

  if (!reading) {
    return null
  }

  return (
    <aside
      ref={tooltipRef}
      className={`map-weather-tooltip ${reading.earthquakes?.length || reading.volcanoes?.length ? 'has-event-details' : ''}`}
      style={{
        left: reading.screenX,
        top: reading.screenY
      }}
      aria-live="polite"
    >
      <button
        type="button"
        className="map-weather-tooltip-close"
        aria-label={t('common.close')}
        title={t('common.close')}
        onClick={onClose}
      >
        <CloseIcon />
      </button>

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
        <div className="map-weather-tooltip-air-quality">
          <div className="map-weather-tooltip-row">
            <BlurOnIcon />
            <strong>
              {t('map.airQualityIndex', {
                value: Math.round(reading.europeanAqi)
              })}
            </strong>
          </div>
          {reading.pm2_5 !== undefined && (
            <span>
              {t('map.pm25', { value: reading.pm2_5.toFixed(1) })}
            </span>
          )}
          {reading.pm10 !== undefined && (
            <span>
              {t('map.pm10', { value: reading.pm10.toFixed(1) })}
            </span>
          )}
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

      {reading.earthquakes && reading.earthquakes.length > 0 && (
        <section className="map-weather-tooltip-earthquakes">
          <div className="map-weather-tooltip-row">
            <SensorsIcon />
            <strong>
              {t('seismic.reportCount', {
                count: reading.earthquakes.length
              })}
            </strong>
          </div>
          {reading.earthquakes.map(earthquake => (
            <article
              className="map-weather-tooltip-earthquake"
              key={earthquake.id}
            >
              <strong>
                {t('seismic.earthquakeTitle', {
                  magnitude: earthquake.magnitude.toFixed(1)
                })}
              </strong>
              <span>{earthquake.place}</span>
              <span>
                {t('seismic.depth', {
                  value: earthquake.depthKm.toFixed(1)
                })}
                {' · '}
                {t('seismic.occurred', {
                  date: new Date(earthquake.occurredAt).toLocaleString()
                })}
              </span>
              {earthquake.tsunamiProduct && (
                <span className="map-weather-tooltip-earthquake-notice">
                  {t('seismic.tsunamiProduct')}
                </span>
              )}
              <a
                href={earthquake.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('seismic.openEarthquake')}
              </a>
            </article>
          ))}
        </section>
      )}

      {reading.volcanoes && reading.volcanoes.length > 0 && (
        <section className="map-weather-tooltip-volcanoes">
          <div className="map-weather-tooltip-row">
            <LandscapeIcon />
            <strong>
              {t('volcano.reportCount', {
                count: reading.volcanoes.length
              })}
            </strong>
          </div>
          {reading.volcanoes.map(volcano => (
            <article
              className="map-weather-tooltip-volcano"
              key={volcano.id}
            >
              <strong>{volcano.name}</strong>
              <span>{volcano.country}</span>
              <span className={`map-weather-tooltip-volcano-status is-${volcano.activity}`}>
                {t(volcanoActivityKey(volcano.activity))}
              </span>
              <span>
                {t('volcano.reportFor', { period: volcano.reportPeriod })}
                {volcano.publishedAt && (
                  ` · ${t('volcano.published', {
                    date: new Date(volcano.publishedAt).toLocaleDateString()
                  })}`
                )}
              </span>
              <p>{volcano.summary}</p>
              <div className="map-weather-tooltip-volcano-links">
                <a href={volcano.reportUrl} target="_blank" rel="noopener noreferrer">
                  {t('volcano.weeklyReport')}
                </a>
                <a href={volcano.profileUrl} target="_blank" rel="noopener noreferrer">
                  {t('volcano.profile')}
                </a>
              </div>
              <small>{volcano.notice}</small>
            </article>
          ))}
        </section>
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

function volcanoActivityKey(
  activity: NonNullable<MapWeatherPointer['volcanoes']>[number]['activity']
): TranslationKey {
  const keys: Record<typeof activity, TranslationKey> = {
    'new-eruption': 'volcano.newEruption',
    eruption: 'volcano.eruption',
    'new-unrest': 'volcano.newUnrest',
    unrest: 'volcano.unrest',
    other: 'volcano.other'
  }

  return keys[activity]
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
