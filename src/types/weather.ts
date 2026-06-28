export type WeatherLocation = {
  latitude: number
  longitude: number
  label: string
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
}

export type OpenMeteoResponse = {
  latitude: number
  longitude: number
  timezone: string
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

export type WeatherMode = 'temperature' | 'wind' | 'jet-stream' | 'precipitation' | 'storm' | 'air-quality'

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

export type AirQualityReading = Omit<AirQualityMapSample, 'updatedAt'>

export type MapWeatherPointer = {
  screenX: number
  screenY: number
  latitude: number
  longitude: number
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
}
