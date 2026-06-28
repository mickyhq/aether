import L from 'leaflet'
import type { AirQualityMapSample, WeatherMapSample, WeatherMode } from '../types/weather'
import { JET_STREAM_SAMPLE_ZOOM } from '../weather/constants'

type Particle = {
  x: number
  y: number
  life: number
  maxLife: number
  seed: number
  strength: number
}

type ProjectedSample = {
  sample: WeatherMapSample
  x: number
  y: number
}

type ProjectedAirQualitySample = {
  sample: AirQualityMapSample
  x: number
  y: number
}

type LightningSegment = {
  x1: number
  y1: number
  x2: number
  y2: number
  alpha: number
}

const PARTICLE_COUNT = 560
const WIND_COLORS = [
  '#70d6ff',
  '#4ee0bd',
  '#9be564',
  '#f4e65e',
  '#ffb347',
  '#ff6b5e',
  '#d967ff'
]
const JET_STREAM_COLORS = [
  '#6ce5ff',
  '#62b8ff',
  '#7785ff',
  '#a46cff',
  '#e66cff',
  '#ff83c8',
  '#fff4ff'
]

export class WeatherMapAnimation {
  private map: L.Map
  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private temperatureCanvas = document.createElement('canvas')
  private temperatureContext: CanvasRenderingContext2D
  private temperatureTextureDirty = true
  private airQualityCanvas = document.createElement('canvas')
  private airQualityContext: CanvasRenderingContext2D
  private airQualityTextureDirty = true
  private samples: WeatherMapSample[] = []
  private airQualitySamples: AirQualityMapSample[] = []
  private mode: WeatherMode = 'temperature'
  private particles: Particle[]
  private lightning: LightningSegment[] = []
  private animationFrame = 0
  private lastTime = 0
  private width = 1
  private height = 1
  private pixelRatio = 1
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(map: L.Map, container: HTMLElement) {
    this.map = map
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'weather-map-animation-canvas'
    container.appendChild(this.canvas)

    const context = this.canvas.getContext('2d')

    if (!context) {
      throw new Error('Weather animation canvas unavailable')
    }

    const temperatureContext = this.temperatureCanvas.getContext('2d')

    if (!temperatureContext) {
      throw new Error('Weather temperature canvas unavailable')
    }

    const airQualityContext = this.airQualityCanvas.getContext('2d')

    if (!airQualityContext) {
      throw new Error('Air quality canvas unavailable')
    }

    this.context = context
    this.temperatureContext = temperatureContext
    this.airQualityContext = airQualityContext
    this.particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: 0,
      y: 0,
      life: 0,
      maxLife: 1,
      seed: Math.random() * 1000,
      strength: 0
    }))
  }

  start() {
    this.resize()

    if (this.reducedMotion) {
      this.render(0, 0)
      return
    }

    this.animationFrame = window.requestAnimationFrame(time => this.tick(time))
  }

  destroy() {
    window.cancelAnimationFrame(this.animationFrame)
    this.canvas.remove()
  }

  setData(
    samples: WeatherMapSample[],
    mode: WeatherMode,
    airQualitySamples: AirQualityMapSample[]
  ) {
    const samplesChanged = samples !== this.samples
    const airQualityChanged = airQualitySamples !== this.airQualitySamples

    if (mode !== this.mode || samplesChanged || airQualityChanged) {
      this.resetParticles()
      this.lightning = []
    }

    this.samples = samples
    this.airQualitySamples = airQualitySamples
    this.mode = mode

    if (samplesChanged) {
      this.temperatureTextureDirty = true
    }

    if (airQualityChanged) {
      this.airQualityTextureDirty = true
    }

    if (this.reducedMotion) {
      this.render(0, 0)
    }
  }

  invalidate() {
    this.resetParticles()
    this.temperatureTextureDirty = true
    this.airQualityTextureDirty = true

    if (this.reducedMotion) {
      this.resize()
      this.render(0, 0)
    }
  }

  private tick(time: number) {
    const deltaTime = Math.min((time - this.lastTime) / 1000 || 0.016, 0.04)
    this.lastTime = time
    this.resize()
    this.render(deltaTime, time / 1000)
    this.animationFrame = window.requestAnimationFrame(nextTime => this.tick(nextTime))
  }

  private resize() {
    const size = this.map.getSize()
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)

    if (size.x === this.width && size.y === this.height && pixelRatio === this.pixelRatio) {
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
    this.temperatureTextureDirty = true
    this.airQualityTextureDirty = true
    this.resetParticles()
  }

  private render(deltaTime: number, time: number) {
    this.context.clearRect(0, 0, this.width, this.height)

    if (this.mode === 'air-quality') {
      if (this.airQualitySamples.length === 0) {
        return
      }

      const projectedAirQuality = this.airQualitySamples.map(sample => {
        const point = this.map.latLngToContainerPoint([sample.latitude, sample.longitude])

        return {
          sample,
          x: point.x,
          y: point.y
        }
      })

      this.drawAirQuality(projectedAirQuality, time)
      return
    }

    if (this.samples.length === 0) {
      return
    }

    const projectedSamples = this.samples.map(sample => {
      const point = this.map.latLngToContainerPoint([sample.latitude, sample.longitude])

      return {
        sample,
        x: point.x,
        y: point.y
      }
    })

    if (this.mode === 'temperature') {
      this.drawTemperature(projectedSamples, time)
      return
    }

    if (this.mode === 'wind') {
      this.drawWind(projectedSamples, deltaTime)
      return
    }

    if (this.mode === 'jet-stream') {
      this.drawJetStream(projectedSamples, deltaTime)
      return
    }

    if (this.mode === 'precipitation') {
      this.drawPrecipitation(projectedSamples, deltaTime)
      return
    }

    this.drawStorm(projectedSamples, deltaTime, time)
  }

  private drawTemperature(samples: ProjectedSample[], time: number) {
    if (this.temperatureTextureDirty) {
      this.renderTemperatureTexture(samples)
    }

    const pulse = this.reducedMotion ? 0 : Math.sin(time * 0.4) * 0.025

    this.context.save()
    this.context.globalAlpha = 0.48 + pulse
    this.context.imageSmoothingEnabled = true
    this.context.drawImage(this.temperatureCanvas, 0, 0, this.width, this.height)
    this.context.restore()
    this.drawTemperatureLegend(samples)
  }

  private renderTemperatureTexture(samples: ProjectedSample[]) {
    const scale = 8
    const width = Math.max(1, Math.ceil(this.width / scale))
    const height = Math.max(1, Math.ceil(this.height / scale))

    this.temperatureCanvas.width = width
    this.temperatureCanvas.height = height

    const image = this.temperatureContext.createImageData(width, height)

    for (let row = 0; row < height; row += 1) {
      const screenY = (row + 0.5) * this.height / height

      for (let column = 0; column < width; column += 1) {
        const screenX = (column + 0.5) * this.width / width
        const temperature = interpolateTemperature(screenX, screenY, samples)
        const color = temperatureColor(temperature)
        const offset = (row * width + column) * 4

        image.data[offset] = color.r
        image.data[offset + 1] = color.g
        image.data[offset + 2] = color.b
        image.data[offset + 3] = 255
      }
    }

    this.temperatureContext.putImageData(image, 0, 0)
    this.temperatureTextureDirty = false
  }

  private drawTemperatureLegend(samples: ProjectedSample[]) {
    const temperatures = samples.map(({ sample }) => sample.temperature)
    const minTemperature = Math.min(...temperatures)
    const maxTemperature = Math.max(...temperatures)
    const legendWidth = Math.min(440, this.width - 48)
    const x = (this.width - legendWidth) / 2
    const y = this.height - 34
    const gradient = this.context.createLinearGradient(x, 0, x + legendWidth, 0)

    for (let step = 0; step <= 12; step += 1) {
      const color = temperatureColor(-15 + step * 5)
      gradient.addColorStop(step / 12, `rgb(${color.r}, ${color.g}, ${color.b})`)
    }

    this.context.fillStyle = 'rgba(4, 10, 15, 0.72)'
    this.context.beginPath()
    this.context.roundRect(x - 12, y - 10, legendWidth + 24, 42, 8)
    this.context.fill()
    this.context.fillStyle = gradient
    this.context.fillRect(x, y, legendWidth, 12)
    this.context.fillStyle = 'rgba(247, 252, 255, 0.94)'
    this.context.font = '700 12px Inter, system-ui, sans-serif'
    this.context.textAlign = 'left'
    this.context.fillText(`${Math.round(minTemperature)}°C`, x, y + 29)
    this.context.textAlign = 'right'
    this.context.fillText(`${Math.round(maxTemperature)}°C`, x + legendWidth, y + 29)
  }

  private drawAirQuality(samples: ProjectedAirQualitySample[], time: number) {
    if (this.airQualityTextureDirty) {
      this.renderAirQualityTexture(samples)
    }

    const pulse = this.reducedMotion ? 0 : Math.sin(time * 0.35) * 0.02

    this.context.save()
    this.context.globalAlpha = 0.7 + pulse
    this.context.imageSmoothingEnabled = true
    this.context.drawImage(this.airQualityCanvas, 0, 0, this.width, this.height)
    this.context.restore()
    this.drawAirQualityLegend(samples)
  }

  private renderAirQualityTexture(samples: ProjectedAirQualitySample[]) {
    const scale = 8
    const width = Math.max(1, Math.ceil(this.width / scale))
    const height = Math.max(1, Math.ceil(this.height / scale))

    this.airQualityCanvas.width = width
    this.airQualityCanvas.height = height

    const image = this.airQualityContext.createImageData(width, height)

    for (let row = 0; row < height; row += 1) {
      const screenY = (row + 0.5) * this.height / height

      for (let column = 0; column < width; column += 1) {
        const screenX = (column + 0.5) * this.width / width
        const airQuality = interpolateAirQuality(screenX, screenY, samples)
        const color = airQualityColor(airQuality)
        const offset = (row * width + column) * 4

        image.data[offset] = color.r
        image.data[offset + 1] = color.g
        image.data[offset + 2] = color.b
        image.data[offset + 3] = 255
      }
    }

    this.airQualityContext.putImageData(image, 0, 0)
    this.airQualityTextureDirty = false
  }

  private drawAirQualityLegend(samples: ProjectedAirQualitySample[]) {
    const values = samples.map(({ sample }) => sample.europeanAqi)
    const minimum = Math.min(...values)
    const maximum = Math.max(...values)
    const legendWidth = Math.min(440, this.width - 48)
    const x = (this.width - legendWidth) / 2
    const y = this.height - 34
    const gradient = this.context.createLinearGradient(x, 0, x + legendWidth, 0)

    for (let step = 0; step <= 10; step += 1) {
      const color = airQualityColor(step * 10)
      gradient.addColorStop(step / 10, `rgb(${color.r}, ${color.g}, ${color.b})`)
    }

    this.context.fillStyle = 'rgba(4, 10, 15, 0.76)'
    this.context.beginPath()
    this.context.roundRect(x - 12, y - 10, legendWidth + 24, 42, 8)
    this.context.fill()
    this.context.fillStyle = gradient
    this.context.fillRect(x, y, legendWidth, 12)
    this.context.fillStyle = 'rgba(247, 252, 255, 0.94)'
    this.context.font = '700 12px Inter, system-ui, sans-serif'
    this.context.textAlign = 'left'
    this.context.fillText(`Good · ${Math.round(minimum)}`, x, y + 29)
    this.context.textAlign = 'right'
    this.context.fillText(`${Math.round(maximum)} · Very poor`, x + legendWidth, y + 29)
  }

  private drawWind(samples: ProjectedSample[], deltaTime: number) {
    const averageWind = samples.reduce((sum, { sample }) => sum + sample.rawWindSpeed, 0) / samples.length

    this.context.fillStyle = `rgba(8, 35, 48, ${Math.min(0.1 + averageWind / 420, 0.24)})`
    this.context.fillRect(0, 0, this.width, this.height)

    if (this.reducedMotion) {
      this.drawWindLegend()
      return
    }

    const activeCount = Math.min(PARTICLE_COUNT, Math.round(220 + averageWind * 8))
    const paths = WIND_COLORS.map(() => new Path2D())
    const usedBuckets = new Set<number>()

    this.context.save()
    this.context.lineCap = 'round'

    for (let index = 0; index < activeCount; index += 1) {
      const particle = this.particles[index]

      if (particle.life <= 0 || this.isOutside(particle.x, particle.y, 30)) {
        this.resetWindParticle(particle)
      }

      const field = windFieldAt(particle.x, particle.y, samples)
      const speed = 25 + field.speed * 2.5
      const tail = 5 + Math.min(field.speed, 80) * 0.28

      particle.x += field.x * speed * deltaTime
      particle.y += field.y * speed * deltaTime
      particle.life -= deltaTime

      const bucket = Math.min(
        WIND_COLORS.length - 1,
        Math.floor(field.speed / 12)
      )
      const path = paths[bucket]

      usedBuckets.add(bucket)
      path.moveTo(particle.x - field.x * tail, particle.y - field.y * tail)
      path.lineTo(particle.x, particle.y)
    }

    for (const bucket of usedBuckets) {
      this.context.lineWidth = 3.8
      this.context.strokeStyle = 'rgba(1, 16, 24, 0.76)'
      this.context.stroke(paths[bucket])
      this.context.lineWidth = 1.55
      this.context.strokeStyle = WIND_COLORS[bucket]
      this.context.stroke(paths[bucket])
    }

    this.context.restore()
    this.drawWindLegend()
  }

  private drawWindLegend() {
    const legendWidth = Math.min(360, this.width - 48)
    const x = (this.width - legendWidth) / 2
    const y = this.height - 34
    const gradient = this.context.createLinearGradient(x, 0, x + legendWidth, 0)

    for (let index = 0; index < WIND_COLORS.length; index += 1) {
      gradient.addColorStop(index / (WIND_COLORS.length - 1), WIND_COLORS[index])
    }

    this.context.fillStyle = 'rgba(4, 10, 15, 0.72)'
    this.context.beginPath()
    this.context.roundRect(x - 12, y - 10, legendWidth + 24, 42, 8)
    this.context.fill()
    this.context.fillStyle = gradient
    this.context.fillRect(x, y, legendWidth, 12)
    this.context.fillStyle = 'rgba(247, 252, 255, 0.94)'
    this.context.font = '700 12px Inter, system-ui, sans-serif'
    this.context.textAlign = 'left'
    this.context.fillText('0 km/h', x, y + 29)
    this.context.textAlign = 'right'
    this.context.fillText('72+ km/h', x + legendWidth, y + 29)
  }

  private drawJetStream(samples: ProjectedSample[], deltaTime: number) {
    const availableSamples = samples.filter(({ sample }) => (
      sample.jetStreamSpeed !== undefined &&
      sample.jetStreamAngle !== undefined
    ))

    if (availableSamples.length === 0) {
      return
    }

    const averageSpeed = availableSamples.reduce(
      (sum, { sample }) => sum + (sample.jetStreamSpeed ?? 0),
      0
    ) / availableSamples.length

    this.context.fillStyle = `rgba(21, 12, 54, ${Math.min(0.12 + averageSpeed / 1100, 0.34)})`
    this.context.fillRect(0, 0, this.width, this.height)

    if (this.reducedMotion) {
      this.drawJetStreamLegend()
      return
    }

    const activeCount = Math.min(
      PARTICLE_COUNT,
      Math.round(260 + averageSpeed * 1.4)
    )
    const paths = JET_STREAM_COLORS.map(() => new Path2D())
    const usedBuckets = new Set<number>()
    const smoothingDistanceSquared = 14000 * (
      2 ** (2 * (this.map.getZoom() - JET_STREAM_SAMPLE_ZOOM))
    )

    this.context.save()
    this.context.lineCap = 'round'

    for (let index = 0; index < activeCount; index += 1) {
      const particle = this.particles[index]

      if (particle.life <= 0 || this.isOutside(particle.x, particle.y, 60)) {
        this.resetWindParticle(particle)
      }

      const field = windFieldAt(
        particle.x,
        particle.y,
        availableSamples,
        true,
        smoothingDistanceSquared
      )
      const speed = 24 + Math.min(field.speed, 320) * 0.72
      const tail = 12 + Math.min(field.speed, 320) * 0.17

      particle.x += field.x * speed * deltaTime
      particle.y += field.y * speed * deltaTime
      particle.life -= deltaTime

      const bucket = Math.max(
        0,
        Math.min(
          JET_STREAM_COLORS.length - 1,
          Math.floor((field.speed - 60) / 40)
        )
      )
      const path = paths[bucket]

      usedBuckets.add(bucket)
      path.moveTo(particle.x - field.x * tail, particle.y - field.y * tail)
      path.lineTo(particle.x, particle.y)
    }

    for (const bucket of usedBuckets) {
      this.context.lineWidth = 7
      this.context.strokeStyle = 'rgba(18, 6, 45, 0.52)'
      this.context.stroke(paths[bucket])
      this.context.lineWidth = 2.1
      this.context.strokeStyle = JET_STREAM_COLORS[bucket]
      this.context.stroke(paths[bucket])
    }

    this.context.restore()
    this.drawJetStreamLegend()
  }

  private drawJetStreamLegend() {
    const legendWidth = Math.min(380, this.width - 48)
    const x = (this.width - legendWidth) / 2
    const y = this.height - 34
    const gradient = this.context.createLinearGradient(x, 0, x + legendWidth, 0)

    for (let index = 0; index < JET_STREAM_COLORS.length; index += 1) {
      gradient.addColorStop(
        index / (JET_STREAM_COLORS.length - 1),
        JET_STREAM_COLORS[index]
      )
    }

    this.context.fillStyle = 'rgba(10, 5, 28, 0.8)'
    this.context.beginPath()
    this.context.roundRect(x - 12, y - 10, legendWidth + 24, 42, 8)
    this.context.fill()
    this.context.fillStyle = gradient
    this.context.fillRect(x, y, legendWidth, 12)
    this.context.fillStyle = 'rgba(247, 252, 255, 0.96)'
    this.context.font = '700 12px Inter, system-ui, sans-serif'
    this.context.textAlign = 'left'
    this.context.fillText('60 km/h · 250 hPa', x, y + 29)
    this.context.textAlign = 'right'
    this.context.fillText('300+ km/h', x + legendWidth, y + 29)
  }

  private drawPrecipitation(samples: ProjectedSample[], deltaTime: number) {
    const wetSamples = samples.filter(({ sample }) => sample.precipitation > 0.02 || sample.snowfall > 0.02)

    if (this.reducedMotion || wetSamples.length === 0) {
      return
    }

    const totalStrength = wetSamples.reduce((sum, { sample }) => sum + precipitationStrength(sample), 0)
    const activeCount = Math.min(PARTICLE_COUNT, Math.round(totalStrength * 130))

    this.context.save()
    this.context.lineCap = 'round'
    this.context.lineWidth = 1.15
    this.context.strokeStyle = 'rgba(194, 232, 255, 0.72)'
    this.context.beginPath()

    for (let index = 0; index < activeCount; index += 1) {
      const particle = this.particles[index]

      if (particle.life <= 0 || this.isOutside(particle.x, particle.y, 36)) {
        this.resetPrecipitationParticle(particle, wetSamples)
      }

      const field = windFieldAt(particle.x, particle.y, samples)
      const fallSpeed = 130 + particle.strength * 390
      const drift = field.x * (22 + field.speed * 0.45)

      particle.x += drift * deltaTime
      particle.y += fallSpeed * deltaTime
      particle.life -= deltaTime

      this.context.moveTo(particle.x, particle.y)
      this.context.lineTo(particle.x - drift * 0.045, particle.y - 9 - particle.strength * 12)
    }

    this.context.stroke()
    this.context.restore()
  }

  private drawStorm(samples: ProjectedSample[], deltaTime: number, time: number) {
    const stormSamples = samples.filter(({ sample }) => sample.isThunderstorm || sample.precipitation > 0.5)

    for (const { sample, x, y } of stormSamples) {
      const strength = Math.min(1, precipitationStrength(sample) + (sample.isThunderstorm ? 0.45 : 0))

      this.context.strokeStyle = `rgba(224, 236, 255, ${0.18 + strength * 0.38})`
      this.context.lineWidth = 2.5
      this.context.beginPath()
      this.context.arc(x, y, 74 + Math.sin(time * 2 + sample.longitude) * 12, time, time + Math.PI * 1.35)
      this.context.stroke()
    }

    if (!this.reducedMotion && stormSamples.length > 0 && Math.random() < deltaTime * 0.35) {
      const source = stormSamples[Math.floor(Math.random() * stormSamples.length)]
      this.spawnLightning(source.x + (Math.random() - 0.5) * 120, Math.max(0, source.y - 160))
    }

    this.updateLightning(deltaTime)
  }

  private updateLightning(deltaTime: number) {
    let flash = 0

    for (let index = this.lightning.length - 1; index >= 0; index -= 1) {
      const segment = this.lightning[index]
      segment.alpha -= deltaTime * 2.8

      if (segment.alpha <= 0) {
        this.lightning.splice(index, 1)
        continue
      }

      flash = Math.max(flash, segment.alpha)
      this.context.strokeStyle = `rgba(235, 249, 255, ${segment.alpha})`
      this.context.lineWidth = 1.2 + segment.alpha * 2.4
      this.context.beginPath()
      this.context.moveTo(segment.x1, segment.y1)
      this.context.lineTo(segment.x2, segment.y2)
      this.context.stroke()
    }

    if (flash > 0) {
      this.context.fillStyle = `rgba(220, 240, 255, ${flash * 0.08})`
      this.context.fillRect(0, 0, this.width, this.height)
    }
  }

  private spawnLightning(startX: number, startY: number) {
    let x = startX
    let y = startY

    for (let segment = 0; segment < 11; segment += 1) {
      const nextX = x + (Math.random() - 0.5) * 48
      const nextY = y + 20 + Math.random() * 22

      this.lightning.push({
        x1: x,
        y1: y,
        x2: nextX,
        y2: nextY,
        alpha: 0.95
      })
      x = nextX
      y = nextY
    }
  }

  private resetWindParticle(particle: Particle) {
    particle.x = Math.random() * this.width
    particle.y = Math.random() * this.height
    particle.maxLife = 1.8 + Math.random() * 4
    particle.life = particle.maxLife
  }

  private resetPrecipitationParticle(particle: Particle, samples: ProjectedSample[]) {
    const source = samples[Math.floor(Math.random() * samples.length)]
    const strength = precipitationStrength(source.sample)
    const angle = particle.seed * 7.13
    const distance = Math.sqrt(Math.random()) * (50 + strength * 130)

    particle.x = source.x + Math.cos(angle) * distance
    particle.y = source.y + Math.sin(angle) * distance - 80
    particle.strength = strength
    particle.maxLife = 0.55 + Math.random() * 1.1
    particle.life = particle.maxLife
  }

  private resetParticles() {
    for (const particle of this.particles) {
      particle.life = 0
    }
  }

  private isOutside(x: number, y: number, padding: number) {
    return x < -padding || x > this.width + padding || y < -padding || y > this.height + padding
  }
}

function windFieldAt(
  x: number,
  y: number,
  samples: ProjectedSample[],
  useJetStream = false,
  smoothingDistanceSquared = 14000
) {
  let vectorX = 0
  let vectorY = 0
  let totalWeight = 0

  for (const projected of samples) {
    const distanceX = projected.x - x
    const distanceY = projected.y - y
    const distanceSquared = distanceX * distanceX + distanceY * distanceY
    const weight = 1 / (distanceSquared + smoothingDistanceSquared)
    const speed = useJetStream
      ? projected.sample.jetStreamSpeed
      : projected.sample.rawWindSpeed
    const angle = useJetStream
      ? projected.sample.jetStreamAngle
      : projected.sample.windAngle

    if (speed === undefined || angle === undefined) {
      continue
    }

    const vector = windVector(angle, useJetStream)

    vectorX += vector.x * speed * weight
    vectorY += vector.y * speed * weight
    totalWeight += weight
  }

  const eastwardSpeed = vectorX / (totalWeight || 1)
  const southwardSpeed = vectorY / (totalWeight || 1)
  const speed = Math.hypot(eastwardSpeed, southwardSpeed)
  const length = speed || 1

  return {
    x: eastwardSpeed / length,
    y: southwardSpeed / length,
    speed
  }
}

function windVector(angle: number, reverse = false) {
  const direction = reverse ? -1 : 1

  return {
    x: -Math.sin(angle) * direction,
    y: Math.cos(angle) * direction
  }
}

function precipitationStrength(sample: WeatherMapSample) {
  return Math.min(1, Math.log1p(sample.precipitation + sample.snowfall * 2) / Math.log(9))
}

function interpolateTemperature(x: number, y: number, samples: ProjectedSample[]) {
  let distance0 = Number.POSITIVE_INFINITY
  let distance1 = Number.POSITIVE_INFINITY
  let distance2 = Number.POSITIVE_INFINITY
  let distance3 = Number.POSITIVE_INFINITY
  let temperature0 = 0
  let temperature1 = 0
  let temperature2 = 0
  let temperature3 = 0

  for (const projected of samples) {
    const deltaX = projected.x - x
    const deltaY = projected.y - y
    const distance = deltaX * deltaX + deltaY * deltaY
    const temperature = projected.sample.temperature

    if (distance < distance0) {
      distance3 = distance2
      temperature3 = temperature2
      distance2 = distance1
      temperature2 = temperature1
      distance1 = distance0
      temperature1 = temperature0
      distance0 = distance
      temperature0 = temperature
    } else if (distance < distance1) {
      distance3 = distance2
      temperature3 = temperature2
      distance2 = distance1
      temperature2 = temperature1
      distance1 = distance
      temperature1 = temperature
    } else if (distance < distance2) {
      distance3 = distance2
      temperature3 = temperature2
      distance2 = distance
      temperature2 = temperature
    } else if (distance < distance3) {
      distance3 = distance
      temperature3 = temperature
    }
  }

  if (distance0 < 1) {
    return temperature0
  }

  const weight0 = 1 / (distance0 + 400)
  const weight1 = 1 / (distance1 + 400)
  const weight2 = 1 / (distance2 + 400)
  const weight3 = 1 / (distance3 + 400)
  const totalWeight = weight0 + weight1 + weight2 + weight3

  return (
    temperature0 * weight0 +
    temperature1 * weight1 +
    temperature2 * weight2 +
    temperature3 * weight3
  ) / totalWeight
}

function interpolateAirQuality(
  x: number,
  y: number,
  samples: ProjectedAirQualitySample[]
) {
  let distance0 = Number.POSITIVE_INFINITY
  let distance1 = Number.POSITIVE_INFINITY
  let distance2 = Number.POSITIVE_INFINITY
  let distance3 = Number.POSITIVE_INFINITY
  let value0 = 0
  let value1 = 0
  let value2 = 0
  let value3 = 0

  for (const projected of samples) {
    const deltaX = projected.x - x
    const deltaY = projected.y - y
    const distance = deltaX * deltaX + deltaY * deltaY
    const value = projected.sample.europeanAqi

    if (distance < distance0) {
      distance3 = distance2
      value3 = value2
      distance2 = distance1
      value2 = value1
      distance1 = distance0
      value1 = value0
      distance0 = distance
      value0 = value
    } else if (distance < distance1) {
      distance3 = distance2
      value3 = value2
      distance2 = distance1
      value2 = value1
      distance1 = distance
      value1 = value
    } else if (distance < distance2) {
      distance3 = distance2
      value3 = value2
      distance2 = distance
      value2 = value
    } else if (distance < distance3) {
      distance3 = distance
      value3 = value
    }
  }

  if (distance0 < 1) {
    return value0
  }

  const weight0 = 1 / (distance0 + 400)
  const weight1 = 1 / (distance1 + 400)
  const weight2 = 1 / (distance2 + 400)
  const weight3 = 1 / (distance3 + 400)
  const totalWeight = weight0 + weight1 + weight2 + weight3

  return (
    value0 * weight0 +
    value1 * weight1 +
    value2 * weight2 +
    value3 * weight3
  ) / totalWeight
}

function airQualityColor(airQuality: number) {
  const stops = [
    { value: 0, r: 50, g: 205, b: 115 },
    { value: 20, r: 105, g: 220, b: 105 },
    { value: 40, r: 245, g: 220, b: 70 },
    { value: 60, r: 255, g: 155, b: 55 },
    { value: 80, r: 245, g: 75, b: 70 },
    { value: 100, r: 150, g: 45, b: 155 }
  ]
  const upperIndex = stops.findIndex(stop => stop.value >= airQuality)
  const upper = stops[upperIndex === -1 ? stops.length - 1 : Math.max(upperIndex, 1)]
  const lower = stops[upperIndex === -1 ? stops.length - 2 : Math.max(upperIndex - 1, 0)]
  const amount = Math.min(1, Math.max(0, (airQuality - lower.value) / (upper.value - lower.value)))

  return {
    r: Math.round(lower.r + (upper.r - lower.r) * amount),
    g: Math.round(lower.g + (upper.g - lower.g) * amount),
    b: Math.round(lower.b + (upper.b - lower.b) * amount)
  }
}

function temperatureColor(temperature: number) {
  const stops = [
    { value: -15, r: 82, g: 35, b: 150 },
    { value: -5, r: 25, g: 85, b: 220 },
    { value: 5, r: 30, g: 205, b: 245 },
    { value: 15, r: 75, g: 225, b: 125 },
    { value: 25, r: 255, g: 220, b: 55 },
    { value: 35, r: 255, g: 100, b: 35 },
    { value: 45, r: 220, g: 20, b: 100 }
  ]
  const upperIndex = stops.findIndex(stop => stop.value >= temperature)
  const upper = stops[upperIndex === -1 ? stops.length - 1 : Math.max(upperIndex, 1)]
  const lower = stops[upperIndex === -1 ? stops.length - 2 : Math.max(upperIndex - 1, 0)]
  const amount = Math.min(1, Math.max(0, (temperature - lower.value) / (upper.value - lower.value)))

  return {
    r: Math.round(lower.r + (upper.r - lower.r) * amount),
    g: Math.round(lower.g + (upper.g - lower.g) * amount),
    b: Math.round(lower.b + (upper.b - lower.b) * amount)
  }
}
