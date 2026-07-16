export type WeatherLocation = {
  latitude: number
  longitude: number
  label: string
}

export type DataProvenance = {
  observedAt: string | number | null
  refreshedAt: string | number | null
  source: string
  resolution: string
}

export type WeatherModeProvenance = Partial<
  Record<WeatherMode, DataProvenance>
>

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

export type SoilMoistureReading = {
  date: string
  rootZonePercent: number
  surfacePercent: number
  percentile: number
  category: string
  trend: number
  model: string
  resolution: string
  baseline: string
  latitude: number
  longitude: number
}

export type NearbyWebcam = {
  id: number
  title: string
  city: string
  distanceKm: number
  playerUrl: string
  detailUrl: string
  live: boolean
  updatedAt?: string
}

export type NearbyWebcams = {
  configured: boolean
  radiusKm: number
  total: number
  webcams: NearbyWebcam[]
}

export type StargazingNight = {
  date: string
  score: number
  rating: string
  bestTime: string
  cloudCover: number
  seeingArcseconds: number
  transparency: number
  moonIllumination: number
  moonPhase: string
}

export type StargazingForecast = {
  initializedAt: string
  lightPollution: {
    estimatedBortle: string
    classCode: number
  } | null
  nights: StargazingNight[]
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
  time?: string
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
  time?: string
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

export type WeatherMode = 'temperature' | 'temperature-anomaly' | 'wind' | 'jet-stream' | 'precipitation' | 'air-quality' | 'ocean-current'

export type AnimationQuality = 'low' | 'balanced' | 'high'

export type WeatherDataStatus =
  'loading' | 'live' | 'cached' | 'stale' | 'unavailable'

export type WeatherDataState = {
  status: WeatherDataStatus
  lastSuccessAt: number | null
  staleAgeMs: number | null
}

export type HeatRisk = {
  kind: 'high-heat' | 'extreme-heat' | 'heat-wave'
  days: number
  maximumTemperature: number
}

export type WarningProvider = 'nws' | 'meteoalarm'

export type WarningHazard =
  'storm' |
  'flood' |
  'wind' |
  'snow' |
  'fire-weather' |
  'extreme-temperature' |
  'air-quality' |
  'other'

export type WarningSeverity =
  'unknown' | 'minor' | 'moderate' | 'severe' | 'extreme'

export type WarningCertainty =
  'unknown' | 'unlikely' | 'possible' | 'likely' | 'observed'

export type WarningGeometry = {
  type: 'Polygon' | 'MultiPolygon'
  coordinates: unknown[]
}

export type OfficialWarning = {
  id: string
  provider: WarningProvider
  hazard: WarningHazard
  title: string
  description: string
  severity: WarningSeverity
  certainty: WarningCertainty
  effectiveAt: string | null
  expiresAt: string | null
  updatedAt: string | null
  instructions: string | null
  area: string | null
  source: string
  sourceUrl: string | null
  geometry: WarningGeometry | null
  state: 'active' | 'grace'
  references: string[]
}

export type OfficialWarningsData = {
  generatedAt: string
  cacheState: 'live' | 'grace'
  gracePeriodMinutes: number
  warnings: OfficialWarning[]
  providers: Array<{
    id: WarningProvider
    source: string
    status: 'available' | 'unconfigured' | 'not-applicable'
  }>
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
  provenance: DataProvenance
}

export type WeatherMapSample = {
  label: string
  latitude: number
  longitude: number
  updatedAt?: number
  observedAt?: string
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
  observedAt: string
  europeanAqi: number
  pm2_5: number
  pm10: number
  nitrogenDioxide: number
  ozone: number
}

export type TemperatureNormalResponse = {
  baseline: '1991–2020'
  source: string
  resolution: string
  targetTime: string
  samples: Array<{
    latitude: number
    longitude: number
    normalTemperature: number
    yearCount: number
  }>
}

export type TemperatureAnomalySample = {
  latitude: number
  longitude: number
  actualTemperature: number
  normalTemperature: number
  anomaly: number
  baseline: string
  source: string
  resolution: string
  observedAt: string
  refreshedAt: number
}

export type JetStreamSample = {
  latitude: number
  longitude: number
  updatedAt: number
  observedAt: string
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
  refreshedAt: number
}

export type OceanCurrentReading = {
  oceanCurrentSpeed: number
  oceanCurrentAngle: number
  seaSurfaceTemperature: number
  seaSurfaceTemperatureAnomaly: number
}

export type AirQualityReading = AirQualityMapSample

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
  normalTemperature?: number
  temperatureAnomaly?: number
  temperatureBaseline?: string
  radarRain?: RadarRainReading
  fire?: MapFirePointer
  provenance?: DataProvenance
}
