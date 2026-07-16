import L from 'leaflet'
import { REDUCED_MOTION_QUERY } from '../utils/motion'
import type {
  AnimationQuality,
  AirQualityMapSample,
  JetStreamSample,
  OceanCurrentSample,
  TemperatureAnomalySample,
  WeatherMapSample,
  WeatherMode
} from '../types/weather'
import { WeatherFieldRenderer } from './WeatherFieldRenderer'
import { WeatherParticleRenderer } from './WeatherParticleRenderer'
import type {
  ProjectedAirQualitySample,
  ProjectedTemperatureAnomalySample,
  ProjectedOceanCurrentSample,
  ProjectedSample
} from './weatherAnimationTypes'
import { AnimationPerformanceController } from './AnimationPerformanceController'
import { recordAnimationFrame } from '../services/clientTelemetry'
import {
  isPageVisible,
  subscribeToPageVisibility
} from '../utils/pageVisibility'

export class WeatherMapAnimation {
  private readonly map: L.Map
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private readonly fieldRenderer: WeatherFieldRenderer
  private readonly particleRenderer: WeatherParticleRenderer
  private readonly performanceController = new AnimationPerformanceController(
    window.devicePixelRatio || 1
  )
  private samples: WeatherMapSample[] = []
  private airQualitySamples: AirQualityMapSample[] = []
  private jetStreamSamples: JetStreamSample[] = []
  private oceanCurrentSamples: OceanCurrentSample[] = []
  private temperatureAnomalySamples: TemperatureAnomalySample[] = []
  private projectedSamples: ProjectedSample[] | null = null
  private projectedAirQualitySamples: ProjectedAirQualitySample[] | null = null
  private projectedOceanCurrentSamples: ProjectedOceanCurrentSample[] | null = null
  private projectedTemperatureAnomalySamples: ProjectedTemperatureAnomalySample[] | null = null
  private mode: WeatherMode = 'temperature'
  private animationFrame = 0
  private lastTime = 0
  private width = 1
  private height = 1
  private pixelRatio = 1
  private motionQuery = window.matchMedia(REDUCED_MOTION_QUERY)
  private reducedMotion = this.motionQuery.matches
  private running = false
  private pageVisible = isPageVisible()
  private unsubscribeVisibility: (() => void) | null = null
  private clearBeforeNextRender = false
  private motionChangeHandler = (event: MediaQueryListEvent) => {
    this.reducedMotion = event.matches
    window.cancelAnimationFrame(this.animationFrame)
    this.animationFrame = 0
    this.lastTime = 0
    this.performanceController.resetMeasurement()
    this.particleRenderer.reset()
    this.context.clearRect(0, 0, this.width, this.height)
    this.resize()
    this.syncRenderers()

    if (this.pageVisible) {
      this.render(0, 0)
    }

    if (!this.reducedMotion && this.running && this.pageVisible) {
      this.animationFrame = window.requestAnimationFrame(time => this.tick(time))
    }
  }

  constructor(
    map: L.Map,
    container: HTMLElement,
    seaTemperatureLabel: string
  ) {
    this.map = map
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'weather-map-animation-canvas'
    container.appendChild(this.canvas)

    const context = this.canvas.getContext('2d')

    if (!context) {
      throw new Error('Weather animation canvas unavailable')
    }

    this.context = context
    this.fieldRenderer = new WeatherFieldRenderer(this.canvas, context)
    this.particleRenderer = new WeatherParticleRenderer(
      map,
      context,
      seaTemperatureLabel
    )
  }

  start() {
    this.running = true
    this.motionQuery.addEventListener('change', this.motionChangeHandler)
    this.unsubscribeVisibility = subscribeToPageVisibility(
      this.handlePageVisibility
    )
    this.resize()
    this.syncRenderers()

    if (this.reducedMotion) {
      if (this.pageVisible) {
        this.render(0, 0)
      }
      return
    }

    if (this.pageVisible) {
      this.animationFrame = window.requestAnimationFrame(time => this.tick(time))
    }
  }

  destroy() {
    this.running = false
    window.cancelAnimationFrame(this.animationFrame)
    this.motionQuery.removeEventListener('change', this.motionChangeHandler)
    this.unsubscribeVisibility?.()
    this.unsubscribeVisibility = null
    this.canvas.remove()
  }

  setQuality(quality: AnimationQuality) {
    if (!this.performanceController.setPreference(quality)) {
      return
    }

    this.resize(true)
    this.syncRenderers()

    if (this.reducedMotion && this.pageVisible) {
      this.render(0, 0)
    }
  }

  setData(
    samples: WeatherMapSample[],
    mode: WeatherMode,
    airQualitySamples: AirQualityMapSample[],
    jetStreamSamples: JetStreamSample[],
    oceanCurrentSamples: OceanCurrentSample[],
    temperatureAnomalySamples: TemperatureAnomalySample[]
  ) {
    const samplesChanged = samples !== this.samples
    const airQualityChanged = airQualitySamples !== this.airQualitySamples
    const jetStreamChanged = jetStreamSamples !== this.jetStreamSamples
    const oceanCurrentChanged = oceanCurrentSamples !== this.oceanCurrentSamples
    const temperatureAnomalyChanged = temperatureAnomalySamples !== this.temperatureAnomalySamples
    const activeDataChanged = mode === 'jet-stream'
      ? jetStreamChanged
      : mode === 'air-quality'
        ? airQualityChanged
        : mode === 'ocean-current'
          ? oceanCurrentChanged
        : mode === 'temperature-anomaly'
            ? temperatureAnomalyChanged
            : samplesChanged

    if (mode !== this.mode || activeDataChanged) {
      this.particleRenderer.reset()
      this.clearBeforeNextRender = true
    }

    this.samples = samples
    this.airQualitySamples = airQualitySamples
    this.jetStreamSamples = jetStreamSamples
    this.oceanCurrentSamples = oceanCurrentSamples
    this.temperatureAnomalySamples = temperatureAnomalySamples

    if (samplesChanged) {
      this.projectedSamples = null
    }

    if (airQualityChanged) {
      this.projectedAirQualitySamples = null
    }

    if (oceanCurrentChanged) {
      this.projectedOceanCurrentSamples = null
    }

    if (temperatureAnomalyChanged) {
      this.projectedTemperatureAnomalySamples = null
    }

    this.mode = mode
    this.fieldRenderer.markDataChanged(
      samplesChanged,
      airQualityChanged,
      temperatureAnomalyChanged
    )

    if (this.reducedMotion && this.pageVisible) {
      this.render(0, 0)
    }
  }

  invalidate() {
    this.particleRenderer.reset()
    this.fieldRenderer.invalidate()
    this.invalidateProjectedSamples()
    this.clearBeforeNextRender = true

    if (this.reducedMotion && this.pageVisible) {
      this.resize()
      this.syncRenderers()
      this.render(0, 0)
    }
  }

  private tick(time: number) {
    if (!this.running || this.reducedMotion || !this.pageVisible) {
      return
    }

    const frameTime = this.lastTime > 0 ? time - this.lastTime : 16.7

    recordAnimationFrame(frameTime)
    const qualityChanged = this.performanceController.recordFrame(frameTime)
    const deltaTime = Math.min(frameTime / 1000, 1 / 30)

    this.lastTime = time

    if (qualityChanged) {
      this.resize(true)
    }

    this.resize()
    this.syncRenderers()
    this.render(deltaTime, time / 1000)
    this.animationFrame = window.requestAnimationFrame(
      nextTime => this.tick(nextTime)
    )
  }

  private readonly handlePageVisibility = (visible: boolean) => {
    this.pageVisible = visible
    window.cancelAnimationFrame(this.animationFrame)
    this.animationFrame = 0
    this.lastTime = 0
    this.performanceController.resetMeasurement()

    if (!visible || !this.running) {
      return
    }

    this.resize()
    this.syncRenderers()

    if (this.reducedMotion) {
      this.render(0, 0)
    } else {
      this.animationFrame = window.requestAnimationFrame(time => this.tick(time))
    }
  }

  private resize(force = false) {
    const size = this.map.getSize()
    const pixelRatio = this.performanceController.pixelRatio

    if (
      !force &&
      size.x === this.width &&
      size.y === this.height &&
      pixelRatio === this.pixelRatio
    ) {
      return
    }

    this.width = size.x
    this.height = size.y
    this.pixelRatio = pixelRatio
    this.canvas.width = Math.floor(this.width * this.pixelRatio)
    this.canvas.height = Math.floor(this.height * this.pixelRatio)
    this.canvas.style.width = `${this.width}px`
    this.canvas.style.height = `${this.height}px`
    this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0)
    this.fieldRenderer.invalidate()
    this.particleRenderer.reset()
    this.invalidateProjectedSamples()
  }

  private syncRenderers() {
    this.fieldRenderer.setViewport(
      this.width,
      this.height,
      this.reducedMotion
    )
    this.particleRenderer.setViewport(
      this.width,
      this.height,
      this.reducedMotion,
      this.performanceController.densityScale
    )
  }

  private render(deltaTime: number, time: number) {
    if (this.clearBeforeNextRender || this.mode !== 'ocean-current') {
      this.context.clearRect(0, 0, this.width, this.height)
      this.clearBeforeNextRender = false
    }

    if (this.mode === 'air-quality') {
      this.renderAirQuality(time)
      return
    }

    if (this.mode === 'temperature-anomaly') {
      this.renderTemperatureAnomaly()
      return
    }

    if (this.mode === 'jet-stream') {
      this.particleRenderer.drawJetStream(
        this.jetStreamSamples,
        deltaTime
      )
      return
    }

    if (this.mode === 'ocean-current') {
      this.particleRenderer.drawOceanCurrent(
        this.getProjectedOceanCurrentSamples(),
        deltaTime
      )
      return
    }

    if (this.samples.length === 0) {
      return
    }

    const projectedSamples = this.getProjectedSamples()

    if (this.mode === 'temperature') {
      this.fieldRenderer.drawTemperature(projectedSamples, time)
      return
    }

    if (this.mode === 'wind') {
      this.particleRenderer.drawWind(projectedSamples, deltaTime)
      return
    }

    if (this.mode === 'precipitation') {
      this.particleRenderer.drawPrecipitation(
        projectedSamples,
        deltaTime,
        time
      )
    }
  }

  private renderAirQuality(time: number) {
    if (this.airQualitySamples.length === 0) {
      return
    }

    this.fieldRenderer.drawAirQuality(
      this.getProjectedAirQualitySamples(),
      time
    )
  }

  private renderTemperatureAnomaly() {
    if (this.temperatureAnomalySamples.length === 0) {
      return
    }

    this.fieldRenderer.drawTemperatureAnomaly(
      this.getProjectedTemperatureAnomalySamples()
    )
  }

  private getProjectedSamples() {
    this.projectedSamples ??= this.projectSamples(this.samples)

    return this.projectedSamples
  }

  private getProjectedAirQualitySamples() {
    this.projectedAirQualitySamples ??= this.projectSamples(
      this.airQualitySamples
    )

    return this.projectedAirQualitySamples
  }

  private getProjectedOceanCurrentSamples() {
    this.projectedOceanCurrentSamples ??= this.projectSamples(
      this.oceanCurrentSamples
    )

    return this.projectedOceanCurrentSamples
  }

  private getProjectedTemperatureAnomalySamples() {
    this.projectedTemperatureAnomalySamples ??= this.projectSamples(
      this.temperatureAnomalySamples
    )

    return this.projectedTemperatureAnomalySamples
  }

  private projectSamples<T extends { latitude: number, longitude: number }>(
    samples: T[]
  ) {
    return samples.map(sample => {
      const point = this.map.latLngToContainerPoint([
        sample.latitude,
        sample.longitude
      ])

      return {
        sample,
        x: point.x,
        y: point.y
      }
    })
  }

  private invalidateProjectedSamples() {
    this.projectedSamples = null
    this.projectedAirQualitySamples = null
    this.projectedOceanCurrentSamples = null
    this.projectedTemperatureAnomalySamples = null
  }
}
