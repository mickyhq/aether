import type {
  AirQualityMapSample,
  OceanCurrentSample,
  TemperatureAnomalySample,
  WeatherMapSample
} from '../types/weather'

export type Particle = {
  x: number
  y: number
  life: number
  maxLife: number
  seed: number
  strength: number
}

export type ProjectedSample = {
  sample: WeatherMapSample
  x: number
  y: number
}

export type ProjectedAirQualitySample = {
  sample: AirQualityMapSample
  x: number
  y: number
}

export type ProjectedTemperatureAnomalySample = {
  sample: TemperatureAnomalySample
  x: number
  y: number
}

export type ProjectedOceanCurrentSample = {
  sample: OceanCurrentSample
  x: number
  y: number
}

export type LightningSegment = {
  x1: number
  y1: number
  x2: number
  y2: number
  alpha: number
}
