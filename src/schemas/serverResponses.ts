import {
  isAirQualityResponse,
  isJetStreamResponse,
  isWeatherResponse
} from '../../shared/providerValidation.js'
import type {
  HeatAlert,
  NearbyWebcams,
  OceanCurrentData,
  OpenMeteoAirQualityResponse,
  OpenMeteoHourly,
  OpenMeteoResponse,
  SoilMoistureReading,
  StargazingForecast,
  TemperatureRecords,
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

export type HeatAlertsResponse = {
  alerts: HeatAlert[]
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

export const heatAlertsResponseSchema = createSchema<HeatAlertsResponse>(
  value => isRecord(value) &&
    Array.isArray(value.alerts) &&
    value.alerts.every(isHeatAlert)
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
  heatAlerts: heatAlertsResponseSchema,
  stargazing: stargazingResponseSchema,
  soilMoisture: soilMoistureResponseSchema,
  temperatureRecords: temperatureRecordsResponseSchema,
  webcam: webcamResponseSchema,
  nearbyWebcams: nearbyWebcamsResponseSchema,
  oceanCurrent: oceanCurrentResponseSchema,
  reportedFires: reportedFiresResponseSchema,
  volcanoActivity: volcanoActivityResponseSchema,
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
  ].every(Array.isArray)
}

function isHeatAlert(value: unknown): value is HeatAlert {
  return isRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    isString(value.message) &&
    (value.severity === 'warning' || value.severity === 'error') &&
    isString(value.source)
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
