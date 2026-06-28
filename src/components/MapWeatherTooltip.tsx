import AirIcon from '@mui/icons-material/Air'
import DeviceThermostatIcon from '@mui/icons-material/DeviceThermostat'
import WaterDropIcon from '@mui/icons-material/WaterDrop'
import type { MapWeatherPointer } from '../types/weather'

type MapWeatherTooltipProps = {
  reading: MapWeatherPointer | null
}

export function MapWeatherTooltip({ reading }: MapWeatherTooltipProps) {
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
      <span className="map-weather-tooltip-coordinates">
        {reading.latitude.toFixed(3)}, {reading.longitude.toFixed(3)}
      </span>

      <div className="map-weather-tooltip-row">
        <DeviceThermostatIcon />
        <span>{Math.round(reading.temperature)}°C</span>
      </div>

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
    </aside>
  )
}

function formatWindDirection(angle: number) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const degrees = angle * 180 / Math.PI
  const index = Math.round(degrees / 45) % directions.length

  return directions[index]
}
