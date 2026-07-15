import L from 'leaflet'
import { REDUCED_MOTION_QUERY } from '../utils/motion'
import type {
  AirQualityMapSample,
  JetStreamSample,
  OceanCurrentSample,
  WeatherMapSample,
  WeatherMode
} from '../types/weather'
import { WeatherFieldRenderer } from './WeatherFieldRenderer'
import { WeatherParticleRenderer } from './WeatherParticleRenderer'
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
  private samples: WeatherMapSample[] = []
  private airQualitySamples: AirQualityMapSample[] = []
  private jetStreamSamples: JetStreamSample[] = []
  private oceanCurrentSamples: OceanCurrentSample[] = []
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
    this.particleRenderer.reset()
    this.context.clearRect(0, 0, this.width, this.height)
    this.resize()
    this.syncRenderers()
    this.render(0, 0)

    this.scheduleFrame()
  }

  constructor(map: L.Map, container: HTMLElement) {
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
    this.particleRenderer = new WeatherParticleRenderer(map, context)
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

    this.scheduleFrame()
  }

  destroy() {
    this.running = false
    window.cancelAnimationFrame(this.animationFrame)
    this.motionQuery.removeEventListener('change', this.motionChangeHandler)
    this.unsubscribeVisibility?.()
    this.unsubscribeVisibility = null
    this.canvas.remove()
  }

  setData(
    samples: WeatherMapSample[],
    mode: WeatherMode,
    airQualitySamples: AirQualityMapSample[],
    jetStreamSamples: JetStreamSample[],
    oceanCurrentSamples: OceanCurrentSample[]
  ) {
    const samplesChanged = samples !== this.samples
    const airQualityChanged = airQualitySamples !== this.airQualitySamples
    const jetStreamChanged = jetStreamSamples !== this.jetStreamSamples
    const oceanCurrentChanged = oceanCurrentSamples !== this.oceanCurrentSamples
    const activeDataChanged = mode === 'jet-stream'
      ? jetStreamChanged
      : mode === 'air-quality'
        ? airQualityChanged
        : mode === 'ocean-current'
          ? oceanCurrentChanged
          : samplesChanged

    if (mode !== this.mode || activeDataChanged) {
      this.particleRenderer.reset()
      this.clearBeforeNextRender = true
    }

    this.samples = samples
    this.airQualitySamples = airQualitySamples
    this.jetStreamSamples = jetStreamSamples
    this.oceanCurrentSamples = oceanCurrentSamples
    this.mode = mode
    this.fieldRenderer.markDataChanged(samplesChanged, airQualityChanged)

    if (this.reducedMotion && this.pageVisible) {
      this.render(0, 0)
    }
  }

  invalidate() {
    this.particleRenderer.reset()
    this.fieldRenderer.invalidate()
    this.clearBeforeNextRender = true

    if (this.reducedMotion && this.pageVisible) {
      this.resize()
      this.syncRenderers()
      this.render(0, 0)
    }
  }

  private tick(time: number) {
    this.animationFrame = 0

    if (!this.running || this.reducedMotion || !this.pageVisible) {
      return
    }

    const deltaTime = Math.min((time - this.lastTime) / 1000 || 0.016, 0.04)

    this.lastTime = time
    this.resize()
    this.syncRenderers()
    this.render(deltaTime, time / 1000)
    this.scheduleFrame()
  }

  private readonly handlePageVisibility = (visible: boolean) => {
    this.pageVisible = visible
    window.cancelAnimationFrame(this.animationFrame)
    this.animationFrame = 0
    this.lastTime = 0

    if (!visible || !this.running) {
      return
    }

    this.resize()
    this.syncRenderers()

    if (this.reducedMotion) {
      this.render(0, 0)
    } else {
      this.scheduleFrame()
    }
  }

  private scheduleFrame() {
    if (
      this.animationFrame ||
      !this.running ||
      this.reducedMotion ||
      !this.pageVisible
    ) {
      return
    }

    this.animationFrame = window.requestAnimationFrame(time => this.tick(time))
  }

  private resize() {
    const size = this.map.getSize()
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)

    if (
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
      this.reducedMotion
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

    if (this.mode === 'jet-stream') {
      this.particleRenderer.drawJetStream(
        this.jetStreamSamples,
        deltaTime
      )
      return
    }

    if (this.mode === 'ocean-current') {
      const projectedSamples = this.oceanCurrentSamples.map(sample => {
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

      this.particleRenderer.drawOceanCurrent(projectedSamples, deltaTime)
      return
    }

    if (this.samples.length === 0) {
      return
    }

    const projectedSamples = this.samples.map(sample => {
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

    if (this.mode === 'temperature') {
      this.fieldRenderer.drawTemperature(projectedSamples, time)
      return
    }

    if (this.mode === 'wind') {
      this.particleRenderer.drawWind(projectedSamples, deltaTime)
      return
    }

    if (this.mode === 'precipitation') {
      this.particleRenderer.drawPrecipitation(projectedSamples, deltaTime)
      return
    }

    this.particleRenderer.drawStorm(projectedSamples, deltaTime, time)
  }

  private renderAirQuality(time: number) {
    if (this.airQualitySamples.length === 0) {
      return
    }

    const projectedSamples = this.airQualitySamples.map(sample => {
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

    this.fieldRenderer.drawAirQuality(projectedSamples, time)
  }
}
