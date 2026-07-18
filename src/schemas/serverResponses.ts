import {
  isAirQualityResponse,
  isJetStreamResponse,
  isWeatherResponse
} from '../../shared/providerValidation.js'
import type {
  OfficialWarning,
  OfficialWarningsData,
  NearbyWebcams,
  OceanCurrentData,
  OpenMeteoAirQualityResponse,
  OpenMeteoHourly,
  OpenMeteoResponse,
  SoilMoistureReading,
  StargazingForecast,
  TemperatureRecords,
  TemperatureNormalResponse,
  WeatherLocation
} from '../types/weather'

export type RuntimeSchema<T> = {
  is: (value: unknown) => value is T
  parse: (value: unknown, label?: string) => T
}

export type SearchGeocodeResponse = {
  location?: WeatherLocation
  error?: string
}

export type ReverseGeocodeResponse = {
  label?: string
  error?: string
}

export type EcmwfResponse = {
  latitude: number
  longitude: number
  model?: string
  utc_offset_seconds?: number
  hourly: OpenMeteoHourly
}

export type JetStreamResponse = {
  current: {
    time?: string
    wind_speed_250hPa: number
    wind_direction_250hPa: number
  }
}

export type ReportedFire = {
  id: string
  title: string
  description: string | null
  latitude: number
  longitude: number
  reportedAt: string | null
  magnitude: string | null
  source: string
  sourceUrl: string | null
}

export type ReportedFiresResponse = {
  fires: ReportedFire[]
}

export type VolcanoActivity =
  | 'new-eruption'
  | 'eruption'
  | 'new-unrest'
  | 'unrest'
  | 'other'

export type VolcanoReport = {
  id: string
  volcanoNumber: string
  name: string
  country: string
  reportPeriod: string
  activity: VolcanoActivity
  activityLabel: string
  latitude: number
  longitude: number
  summary: string
  publishedAt: string | null
  reportUrl: string
  profileUrl: string
}

export type VolcanoActivityResponse = {
  volcanoes: VolcanoReport[]
  reportPublishedAt?: string | null
  notice?: string
}

export type EarthquakeEvent = {
  id: string
  magnitude: number
  place: string
  occurredAt: string
  updatedAt: string
  latitude: number
  longitude: number
  depthKm: number
  tsunamiProduct: boolean
  alert: 'green' | 'yellow' | 'orange' | 'red' | null
  status: string
  source: string
  sourceUrl: string
}

export type TsunamiWarning = {
  id: string
  level: 'warning' | 'advisory' | 'watch' | 'threat'
  title: string
  description: string
  instructions: string | null
  sentAt: string
  expiresAt: string | null
  latitude: number
  longitude: number
  magnitude: number | null
  location: string
  source: string
  sourceUrl: string
  state: 'active' | 'grace'
}

export type SeismicEventsResponse = {
  generatedAt: string
  cacheState: 'live' | 'grace'
  gracePeriodMinutes: number
  earthquakes: EarthquakeEvent[]
  tsunamiWarnings: TsunamiWarning[]
}

export type TropicalCycloneTrackPoint = {
  latitude: number
  longitude: number
  validAt: string
  hours: number
  windKnots: number
  gustKnots: number | null
  pressureHpa: number | null
  category: number
  development: string | null
  movementDegrees: number | null
  movementKnots: number | null
}

export type TropicalCycloneObservedPoint = {
  latitude: number
  longitude: number
  observedAt: string
  windKnots: number
}

export type TropicalCycloneGeometry = {
  type: 'Polygon' | 'MultiPolygon'
  coordinates: unknown[]
}

export type TropicalCyclone = {
  id: string
  name: string
  basin: string
  advisoryAt: string
  advisoryNumber: string | null
  current: TropicalCycloneTrackPoint
  observedTrack: TropicalCycloneObservedPoint[]
  forecast: TropicalCycloneTrackPoint[]
  cone: TropicalCycloneGeometry | null
}

export type TropicalCyclonesResponse = {
  generatedAt: string
  cacheState: 'live' | 'grace'
  source: string
  sourceUrl: string
  storms: TropicalCyclone[]
}

export type RadarFrame = {
  time: number
  path: string
}

export type RadarMetadataResponse = {
  frames: RadarFrame[]
}

export type FireLayerStatusResponse = {
  firmsConfigured: boolean
}

export type WebcamResponse = Partial<NearbyWebcams> & {
  error?: string
}

export const searchGeocodeResponseSchema = createSchema<SearchGeocodeResponse>(
  value => isRecord(value) &&
    optional(value.error, isString) &&
    optional(value.location, isWeatherLocation)
)

export const reverseGeocodeResponseSchema = createSchema<ReverseGeocodeResponse>(
  value => isRecord(value) &&
    optional(value.error, isString) &&
    optional(value.label, isString)
)

export const ecmwfResponseSchema = createSchema<EcmwfResponse>(value => (
  isRecord(value) &&
  isFiniteNumber(value.latitude) &&
  isFiniteNumber(value.longitude) &&
  optional(value.model, isString) &&
  optional(value.utc_offset_seconds, isFiniteNumber) &&
  isOpenMeteoHourly(value.hourly)
))

export const openMeteoResponseSchema = createSchema<
  OpenMeteoResponse | OpenMeteoResponse[]
>(value => isWeatherResponse(value))

export const airQualityResponseSchema = createSchema<
  OpenMeteoAirQualityResponse | OpenMeteoAirQualityResponse[]
>(value => isAirQualityResponse(value))

export const jetStreamResponseSchema = createSchema<
  JetStreamResponse | JetStreamResponse[]
>(value => isJetStreamResponse(value))

export const temperatureNormalResponseSchema = createSchema<TemperatureNormalResponse>(
  value => isRecord(value) &&
    value.baseline === '1991–2020' &&
    isString(value.source) &&
    isString(value.resolution) &&
    isString(value.targetTime) &&
    Array.isArray(value.samples) &&
    value.samples.every(sample => (
      isRecord(sample) &&
      isFiniteNumber(sample.latitude) &&
      isFiniteNumber(sample.longitude) &&
      isFiniteNumber(sample.normalTemperature) &&
      isFiniteNumber(sample.yearCount)
    ))
)

export const officialWarningsResponseSchema = createSchema<OfficialWarningsData>(
  value => isRecord(value) &&
    isString(value.generatedAt) &&
    (value.cacheState === 'live' || value.cacheState === 'grace') &&
    isFiniteNumber(value.gracePeriodMinutes) &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isOfficialWarning) &&
    Array.isArray(value.providers) &&
    value.providers.every(provider => (
      isRecord(provider) &&
      (provider.id === 'nws' || provider.id === 'meteoalarm') &&
      isString(provider.source) &&
      (
        provider.status === 'available' ||
        provider.status === 'unconfigured' ||
        provider.status === 'not-applicable'
      )
    ))
)

export const stargazingResponseSchema = createSchema<StargazingForecast>(
  value => isRecord(value) &&
    isString(value.initializedAt) &&
    (value.lightPollution === null || (
      isRecord(value.lightPollution) &&
      isString(value.lightPollution.estimatedBortle) &&
      isFiniteNumber(value.lightPollution.classCode)
    )) &&
    Array.isArray(value.nights) &&
    value.nights.every(night => (
      isRecord(night) &&
      isString(night.date) &&
      isFiniteNumber(night.score) &&
      isString(night.rating) &&
      isString(night.bestTime) &&
      isFiniteNumber(night.cloudCover) &&
      isFiniteNumber(night.seeingArcseconds) &&
      isFiniteNumber(night.transparency) &&
      isFiniteNumber(night.moonIllumination) &&
      isString(night.moonPhase)
    ))
)

export const soilMoistureResponseSchema = createSchema<SoilMoistureReading>(
  value => isRecord(value) &&
    isString(value.date) &&
    isFiniteNumber(value.rootZonePercent) &&
    isFiniteNumber(value.surfacePercent) &&
    isFiniteNumber(value.percentile) &&
    isString(value.category) &&
    isFiniteNumber(value.trend) &&
    isString(value.model) &&
    isString(value.resolution) &&
    isString(value.baseline) &&
    isFiniteNumber(value.latitude) &&
    isFiniteNumber(value.longitude)
)

export const temperatureRecordsResponseSchema = createSchema<TemperatureRecords>(
  value => isRecord(value) &&
    isTemperatureRecord(value.highest) &&
    isTemperatureRecord(value.lowest) &&
    isRecord(value.period) &&
    isString(value.period.start) &&
    isString(value.period.end) &&
    isString(value.model) &&
    isString(value.resolution) &&
    isFiniteNumber(value.latitude) &&
    isFiniteNumber(value.longitude)
)

export const webcamResponseSchema = createSchema<WebcamResponse>(value => (
  isRecord(value) &&
  optional(value.error, isString) &&
  optional(value.configured, isBoolean) &&
  optional(value.radiusKm, isFiniteNumber) &&
  optional(value.total, isFiniteNumber) &&
  optional(value.webcams, webcams => (
    Array.isArray(webcams) && webcams.every(webcam => (
      isRecord(webcam) &&
      isFiniteNumber(webcam.id) &&
      isString(webcam.title) &&
      isString(webcam.city) &&
      isFiniteNumber(webcam.distanceKm) &&
      isString(webcam.playerUrl) &&
      isString(webcam.detailUrl) &&
      isBoolean(webcam.live) &&
      optional(webcam.updatedAt, isString)
    ))
  ))
))

export const nearbyWebcamsResponseSchema = createSchema<NearbyWebcams>(
  value => webcamResponseSchema.is(value) &&
    value.configured === true &&
    isFiniteNumber(value.radiusKm) &&
    isFiniteNumber(value.total) &&
    Array.isArray(value.webcams)
)

export const oceanCurrentResponseSchema = createSchema<OceanCurrentData>(
  value => isRecord(value) &&
    isString(value.source) &&
    isString(value.currentProduct) &&
    isString(value.temperatureProduct) &&
    (value.enso === null || isEnso(value.enso)) &&
    nullable(value.currentTime, isString) &&
    nullable(value.temperatureTime, isString) &&
    isFiniteNumber(value.stride) &&
    isFiniteNumber(value.oceanSampleCount) &&
    Array.isArray(value.samples) &&
    value.samples.every(sample => (
      isRecord(sample) &&
      isFiniteNumber(sample.latitude) &&
      isFiniteNumber(sample.longitude) &&
      isBoolean(sample.ocean) &&
      isFiniteNumber(sample.eastward) &&
      isFiniteNumber(sample.northward) &&
      isFiniteNumber(sample.speed) &&
      isFiniteNumber(sample.temperature) &&
      isFiniteNumber(sample.anomaly)
    ))
)

export const reportedFiresResponseSchema = createSchema<ReportedFiresResponse>(
  value => isRecord(value) &&
    Array.isArray(value.fires) &&
    value.fires.every(fire => (
      isRecord(fire) &&
      isString(fire.id) &&
      isString(fire.title) &&
      nullable(fire.description, isString) &&
      isFiniteNumber(fire.latitude) &&
      isFiniteNumber(fire.longitude) &&
      nullable(fire.reportedAt, isString) &&
      nullable(fire.magnitude, isString) &&
      isString(fire.source) &&
      nullable(fire.sourceUrl, isString)
    ))
)

const VOLCANO_ACTIVITIES = new Set<VolcanoActivity>([
  'new-eruption',
  'eruption',
  'new-unrest',
  'unrest',
  'other'
])

export const volcanoActivityResponseSchema = createSchema<VolcanoActivityResponse>(
  value => isRecord(value) &&
    optional(value.reportPublishedAt, item => nullable(item, isString)) &&
    optional(value.notice, isString) &&
    Array.isArray(value.volcanoes) &&
    value.volcanoes.every(volcano => (
      isRecord(volcano) &&
      isString(volcano.id) &&
      isString(volcano.volcanoNumber) &&
      isString(volcano.name) &&
      isString(volcano.country) &&
      isString(volcano.reportPeriod) &&
      isString(volcano.activity) &&
      VOLCANO_ACTIVITIES.has(volcano.activity as VolcanoActivity) &&
      isString(volcano.activityLabel) &&
      isFiniteNumber(volcano.latitude) &&
      isFiniteNumber(volcano.longitude) &&
      isString(volcano.summary) &&
      nullable(volcano.publishedAt, isString) &&
      isString(volcano.reportUrl) &&
      isString(volcano.profileUrl)
    ))
)

export const seismicEventsResponseSchema = createSchema<SeismicEventsResponse>(
  value => isRecord(value) &&
    isString(value.generatedAt) &&
    (value.cacheState === 'live' || value.cacheState === 'grace') &&
    isFiniteNumber(value.gracePeriodMinutes) &&
    Array.isArray(value.earthquakes) &&
    value.earthquakes.every(earthquake => (
      isRecord(earthquake) &&
      isString(earthquake.id) &&
      isFiniteNumber(earthquake.magnitude) &&
      isString(earthquake.place) &&
      isString(earthquake.occurredAt) &&
      isString(earthquake.updatedAt) &&
      isFiniteNumber(earthquake.latitude) &&
      isFiniteNumber(earthquake.longitude) &&
      isFiniteNumber(earthquake.depthKm) &&
      isBoolean(earthquake.tsunamiProduct) &&
      (
        earthquake.alert === null ||
        ['green', 'yellow', 'orange', 'red'].includes(String(earthquake.alert))
      ) &&
      isString(earthquake.status) &&
      isString(earthquake.source) &&
      isString(earthquake.sourceUrl)
    )) &&
    Array.isArray(value.tsunamiWarnings) &&
    value.tsunamiWarnings.every(warning => (
      isRecord(warning) &&
      isString(warning.id) &&
      ['warning', 'advisory', 'watch', 'threat']
        .includes(String(warning.level)) &&
      isString(warning.title) &&
      isString(warning.description) &&
      nullable(warning.instructions, isString) &&
      isString(warning.sentAt) &&
      nullable(warning.expiresAt, isString) &&
      isFiniteNumber(warning.latitude) &&
      isFiniteNumber(warning.longitude) &&
      nullable(warning.magnitude, isFiniteNumber) &&
      isString(warning.location) &&
      isString(warning.source) &&
      isString(warning.sourceUrl) &&
      (warning.state === 'active' || warning.state === 'grace')
    ))
)

export const tropicalCyclonesResponseSchema = createSchema<TropicalCyclonesResponse>(
  value => isRecord(value) &&
    isString(value.generatedAt) &&
    (value.cacheState === 'live' || value.cacheState === 'grace') &&
    isString(value.source) &&
    isString(value.sourceUrl) &&
    Array.isArray(value.storms) &&
    value.storms.every(storm => (
      isRecord(storm) &&
      isString(storm.id) &&
      isString(storm.name) &&
      isString(storm.basin) &&
      isString(storm.advisoryAt) &&
      nullable(storm.advisoryNumber, isString) &&
      isTropicalCyclonePoint(storm.current) &&
      Array.isArray(storm.observedTrack) &&
      storm.observedTrack.every(point => (
        isRecord(point) &&
        isFiniteNumber(point.latitude) &&
        isFiniteNumber(point.longitude) &&
        isString(point.observedAt) &&
        isFiniteNumber(point.windKnots)
      )) &&
      Array.isArray(storm.forecast) &&
      storm.forecast.every(isTropicalCyclonePoint) &&
      (
        storm.cone === null || (
          isRecord(storm.cone) &&
          (storm.cone.type === 'Polygon' || storm.cone.type === 'MultiPolygon') &&
          Array.isArray(storm.cone.coordinates)
        )
      )
    ))
)

export const radarMetadataResponseSchema = createSchema<RadarMetadataResponse>(
  value => isRecord(value) &&
    Array.isArray(value.frames) &&
    value.frames.every(frame => (
      isRecord(frame) &&
      isFiniteNumber(frame.time) &&
      isString(frame.path)
    ))
)

export const fireLayerStatusResponseSchema = createSchema<FireLayerStatusResponse>(
  value => isRecord(value) && isBoolean(value.firmsConfigured)
)

export const runtimeResponseSchemas = {
  searchGeocode: searchGeocodeResponseSchema,
  reverseGeocode: reverseGeocodeResponseSchema,
  ecmwf: ecmwfResponseSchema,
  openMeteo: openMeteoResponseSchema,
  airQuality: airQualityResponseSchema,
  jetStream: jetStreamResponseSchema,
  temperatureNormal: temperatureNormalResponseSchema,
  officialWarnings: officialWarningsResponseSchema,
  stargazing: stargazingResponseSchema,
  soilMoisture: soilMoistureResponseSchema,
  temperatureRecords: temperatureRecordsResponseSchema,
  webcam: webcamResponseSchema,
  nearbyWebcams: nearbyWebcamsResponseSchema,
  oceanCurrent: oceanCurrentResponseSchema,
  reportedFires: reportedFiresResponseSchema,
  volcanoActivity: volcanoActivityResponseSchema,
  seismicEvents: seismicEventsResponseSchema,
  tropicalCyclones: tropicalCyclonesResponseSchema,
  radarMetadata: radarMetadataResponseSchema,
  fireLayerStatus: fireLayerStatusResponseSchema
} as const

export type RuntimeResponseSchemaName = keyof typeof runtimeResponseSchemas

export async function parseResponseJson<T>(
  response: Response,
  schema: RuntimeSchema<T>,
  label: string
) {
  return schema.parse(await response.json(), label)
}

function createSchema<T>(validate: (value: unknown) => boolean): RuntimeSchema<T> {
  const is = (value: unknown): value is T => validate(value)

  return {
    is,
    parse: (value, label = 'Server response') => {
      if (!is(value)) {
        throw new Error(`${label} has invalid data`)
      }

      return value
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function optional(
  value: unknown,
  validate: (value: unknown) => boolean
) {
  return value === undefined || validate(value)
}

function nullable(
  value: unknown,
  validate: (value: unknown) => boolean
) {
  return value === null || validate(value)
}

function isWeatherLocation(value: unknown): value is WeatherLocation {
  return isRecord(value) &&
    isFiniteNumber(value.latitude) &&
    isFiniteNumber(value.longitude) &&
    isString(value.label)
}

function isOpenMeteoHourly(value: unknown): value is OpenMeteoHourly {
  if (!isRecord(value)) {
    return false
  }

  return [
    value.time,
    value.temperature_2m,
    value.precipitation,
    value.snowfall,
    value.weather_code,
    value.cloud_cover,
    value.wind_speed_10m,
    value.wind_direction_10m
  ].every(Array.isArray) && optional(value.pressure_msl, Array.isArray)
}

function isOfficialWarning(value: unknown): value is OfficialWarning {
  return isRecord(value) &&
    isString(value.id) &&
    (value.provider === 'nws' || value.provider === 'meteoalarm') &&
    [
      'storm',
      'flood',
      'wind',
      'snow',
      'fire-weather',
      'extreme-temperature',
      'air-quality',
      'other'
    ].includes(String(value.hazard)) &&
    isString(value.title) &&
    isString(value.description) &&
    ['unknown', 'minor', 'moderate', 'severe', 'extreme']
      .includes(String(value.severity)) &&
    ['unknown', 'unlikely', 'possible', 'likely', 'observed']
      .includes(String(value.certainty)) &&
    nullable(value.effectiveAt, isString) &&
    nullable(value.expiresAt, isString) &&
    nullable(value.updatedAt, isString) &&
    nullable(value.instructions, isString) &&
    nullable(value.area, isString) &&
    isString(value.source) &&
    nullable(value.sourceUrl, isString) &&
    (value.geometry === null || isWarningGeometry(value.geometry)) &&
    (value.state === 'active' || value.state === 'grace') &&
    Array.isArray(value.references) &&
    value.references.every(isString)
}

function isWarningGeometry(value: unknown) {
  return isRecord(value) &&
    (value.type === 'Polygon' || value.type === 'MultiPolygon') &&
    Array.isArray(value.coordinates)
}

function isTropicalCyclonePoint(value: unknown) {
  return isRecord(value) &&
    isFiniteNumber(value.latitude) &&
    isFiniteNumber(value.longitude) &&
    isString(value.validAt) &&
    isFiniteNumber(value.hours) &&
    isFiniteNumber(value.windKnots) &&
    nullable(value.gustKnots, isFiniteNumber) &&
    nullable(value.pressureHpa, isFiniteNumber) &&
    isFiniteNumber(value.category) &&
    nullable(value.development, isString) &&
    nullable(value.movementDegrees, isFiniteNumber) &&
    nullable(value.movementKnots, isFiniteNumber)
}

function isTemperatureRecord(value: unknown) {
  return isRecord(value) &&
    isFiniteNumber(value.temperature) &&
    isString(value.date)
}

function isEnso(value: unknown) {
  return isRecord(value) &&
    value.index === 'RONI' &&
    (
      value.phase === 'el-nino' ||
      value.phase === 'la-nina' ||
      value.phase === 'neutral'
    ) &&
    isString(value.season) &&
    isFiniteNumber(value.year) &&
    isFiniteNumber(value.anomaly) &&
    isBoolean(value.provisional)
}
