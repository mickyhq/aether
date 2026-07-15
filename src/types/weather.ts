export type WeatherLocation = {
  latitude: number
  longitude: number
  label: string
}

export type TemperatureRecord = {
  temperature: number
  date: string
}

export type TemperatureRecords = {
  highest: TemperatureRecord
  lowest: TemperatureRecord
  period: {
    start: string
    end: string
  }
  model: string
  resolution: string
  latitude: number
  longitude: number
}

export type WeatherViewport = {
  north: number
  south: number
  east: number
  west: number
  zoom: number
  width: number
  height: number
}

export type OpenMeteoCurrent = {
  temperature_2m: number
  relative_humidity_2m: number
  rain: number
  showers: number
  snowfall: number
  weather_code: number
  cloud_cover: number
  wind_speed_10m: number
  wind_direction_10m: number
}

export type OpenMeteoHourly = {
  time: string[]
  temperature_2m: number[]
  precipitation: number[]
  snowfall: number[]
  weather_code: number[]
  cloud_cover: number[]
  wind_speed_10m: number[]
  wind_direction_10m: number[]
}

export type OpenMeteoDaily = {
  time: string[]
  temperature_2m_max: number[]
  temperature_2m_min: number[]
  apparent_temperature_max: number[]
  sunrise: string[]
  sunset: string[]
}

export type OpenMeteoResponse = {
  latitude: number
  longitude: number
  timezone: string
  utc_offset_seconds?: number
  current: OpenMeteoCurrent
  hourly: OpenMeteoHourly
  daily?: OpenMeteoDaily
}

export type OpenMeteoAirQualityCurrent = {
  european_aqi: number
  pm2_5: number
  pm10: number
  nitrogen_dioxide: number
  ozone: number
}

export type OpenMeteoAirQualityResponse = {
  latitude: number
  longitude: number
  current: OpenMeteoAirQualityCurrent
}

export type WeatherMode = 'temperature' | 'wind' | 'jet-stream' | 'precipitation' | 'storm' | 'air-quality' | 'ocean-current'

export type WeatherDataState = 'loading' | 'live' | 'cached' | 'stale' | 'unavailable'

export type HeatRisk = {
  kind: 'high-heat' | 'extreme-heat' | 'heat-wave'
  days: number
  maximumTemperature: number
}

export type HeatAlert = {
  id: string
  title: string
  message: string
  severity: 'warning' | 'error'
  source: string
}

export type WeatherEvolutionFrame = {
  time: string
  temperature: number
  precipitation: number
  snowfall: number
  weatherCode: number
  cloudOpacity: number
  windSpeed: number
  rawWindSpeed: number
  windAngle: number
  isThunderstorm: boolean
}

export type EcmwfForecast = {
  model: string
  latitude: number
  longitude: number
  frames: WeatherEvolutionFrame[]
}

export type WeatherConfig = {
  zone: string
  temperature: number
  humidity: number
  weatherCode: number
  description: string
  precipitation: number
  snowfall: number
  windSpeed: number
  rawWindSpeed: number
  windAngle: number
  rainDensity: number
  isThunderstorm: boolean
  cloudOpacity: number
  evolution: WeatherEvolutionFrame[]
  sunrise: string | null
  sunset: string | null
  heatRisk: HeatRisk | null
}

export type WeatherMapSample = {
  label: string
  latitude: number
  longitude: number
  updatedAt?: number
  showBadge?: boolean
  estimated?: boolean
  evolution?: WeatherEvolutionFrame[]
  sunrise?: string | null
  sunset?: string | null
  temperature: number
  precipitation: number
  snowfall: number
  weatherCode: number
  windSpeed: number
  rawWindSpeed: number
  windAngle: number
  cloudOpacity: number
  isThunderstorm: boolean
}

export type AirQualityMapSample = {
  latitude: number
  longitude: number
  updatedAt: number
  europeanAqi: number
  pm2_5: number
  pm10: number
  nitrogenDioxide: number
  ozone: number
}

export type JetStreamSample = {
  latitude: number
  longitude: number
  updatedAt: number
  speed: number
  angle: number
  eastward: number
  northward: number
}

export type OceanCurrentSample = {
  latitude: number
  longitude: number
  ocean: boolean
  eastward: number
  northward: number
  speed: number
  temperature: number
  anomaly: number
}

export type OceanCurrentData = {
  source: string
  currentProduct: string
  temperatureProduct: string
  enso: {
    index: 'RONI'
    phase: 'el-nino' | 'la-nina' | 'neutral'
    season: string
    year: number
    anomaly: number
    provisional: boolean
  } | null
  currentTime: string | null
  temperatureTime: string | null
  stride: number
  oceanSampleCount: number
  samples: OceanCurrentSample[]
}

export type OceanCurrentReading = {
  oceanCurrentSpeed: number
  oceanCurrentAngle: number
  seaSurfaceTemperature: number
  seaSurfaceTemperatureAnomaly: number
}

export type AirQualityReading = Omit<AirQualityMapSample, 'updatedAt'>

export type MapFirePointer = {
  title: string
  source: string
  detail: string
}

export type RadarRainReading = {
  status: 'checking' | 'rain' | 'dry' | 'no-coverage' | 'unavailable'
  observedAt?: string
}

export type MapWeatherPointer = {
  screenX: number
  screenY: number
  latitude: number
  longitude: number
  placeLabel?: string
  temperature: number
  precipitation: number
  rawWindSpeed: number
  windAngle: number
  jetStreamSpeed?: number
  jetStreamAngle?: number
  cloudOpacity: number
  isThunderstorm: boolean
  europeanAqi?: number
  pm2_5?: number
  pm10?: number
  nitrogenDioxide?: number
  ozone?: number
  oceanCurrentSpeed?: number
  oceanCurrentAngle?: number
  seaSurfaceTemperature?: number
  seaSurfaceTemperatureAnomaly?: number
  radarRain?: RadarRainReading
  fire?: MapFirePointer
}
