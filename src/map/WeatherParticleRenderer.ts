import L from 'leaflet'
import type { JetStreamSample } from '../types/weather'
import {
  JET_STREAM_COLORS,
  JET_STREAM_NAMES,
  JET_STREAM_OUTLINE_COLORS,
  WIND_COLORS
} from './weatherPalette'
import type {
  LightningSegment,
  Particle,
  ProjectedSample
} from './weatherAnimationTypes'

const LEGEND_BOTTOM_INSET = 80
import {
  jetStreamBandAt,
  jetStreamFieldAt,
  precipitationStrength,
  windFieldAt
} from './weatherVectorFields'

const PARTICLE_COUNT = 560

export class WeatherParticleRenderer {
  private readonly context: CanvasRenderingContext2D
  private readonly map: L.Map
  private readonly particles: Particle[]
  private lightning: LightningSegment[] = []
  private width = 1
  private height = 1
  private reducedMotion = false

  constructor(map: L.Map, context: CanvasRenderingContext2D) {
    this.map = map
    this.context = context
    this.particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: 0,
      y: 0,
      life: 0,
      maxLife: 1,
      seed: Math.random() * 1000,
      strength: 0
    }))
  }

  setViewport(width: number, height: number, reducedMotion: boolean) {
    this.width = width
    this.height = height
    this.reducedMotion = reducedMotion
  }

  reset() {
    for (const particle of this.particles) {
      particle.life = 0
    }

    this.lightning = []
  }

  drawWind(samples: ProjectedSample[], deltaTime: number) {
    const averageWind = samples.reduce(
      (sum, { sample }) => sum + sample.rawWindSpeed,
      0
    ) / samples.length

    this.context.fillStyle = `rgba(8, 35, 48, ${Math.min(0.1 + averageWind / 420, 0.24)})`
    this.context.fillRect(0, 0, this.width, this.height)

    if (this.reducedMotion) {
      this.drawWindLegend()
      return
    }

    const activeCount = Math.min(
      PARTICLE_COUNT,
      Math.round(220 + averageWind * 8)
    )
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

  drawJetStream(samples: JetStreamSample[], deltaTime: number) {
    if (samples.length === 0) {
      return
    }

    const averageSpeed = samples.reduce(
      (sum, sample) => sum + sample.speed,
      0
    ) / samples.length

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
    const paths = JET_STREAM_OUTLINE_COLORS.map(() => (
      JET_STREAM_COLORS.map(() => new Path2D())
    ))
    const usedPaths: Array<{ stream: number, bucket: number }> = []
    const usedPathKeys = new Set<string>()

    this.context.save()
    this.context.lineCap = 'round'

    for (let index = 0; index < activeCount; index += 1) {
      const particle = this.particles[index]

      if (particle.life <= 0 || this.isOutside(particle.x, particle.y, 60)) {
        this.resetWindParticle(particle)
      }

      const location = this.map.containerPointToLatLng([
        particle.x,
        particle.y
      ])
      const field = jetStreamFieldAt(
        location.lat,
        location.lng,
        samples
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
      const stream = jetStreamBandAt(location.lat)
      const path = paths[stream][bucket]
      const pathKey = `${stream}:${bucket}`

      if (!usedPathKeys.has(pathKey)) {
        usedPathKeys.add(pathKey)
        usedPaths.push({ stream, bucket })
      }

      path.moveTo(particle.x - field.x * tail, particle.y - field.y * tail)
      path.lineTo(particle.x, particle.y)
    }

    for (const { stream, bucket } of usedPaths) {
      this.context.lineWidth = 7
      this.context.globalAlpha = 0.72
      this.context.strokeStyle = JET_STREAM_OUTLINE_COLORS[stream]
      this.context.stroke(paths[stream][bucket])
      this.context.lineWidth = 2.1
      this.context.globalAlpha = 1
      this.context.strokeStyle = JET_STREAM_COLORS[bucket]
      this.context.stroke(paths[stream][bucket])
    }

    this.context.restore()
    this.drawJetStreamLegend()
  }

  drawPrecipitation(samples: ProjectedSample[], deltaTime: number) {
    const wetSamples = samples.filter(({ sample }) => (
      sample.precipitation > 0.02 || sample.snowfall > 0.02
    ))

    if (this.reducedMotion || wetSamples.length === 0) {
      return
    }

    const totalStrength = wetSamples.reduce(
      (sum, { sample }) => sum + precipitationStrength(sample),
      0
    )
    const activeCount = Math.min(
      PARTICLE_COUNT,
      Math.round(totalStrength * 130)
    )

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
      this.context.lineTo(
        particle.x - drift * 0.045,
        particle.y - 9 - particle.strength * 12
      )
    }

    this.context.stroke()
    this.context.restore()
  }

  drawStorm(samples: ProjectedSample[], deltaTime: number, time: number) {
    const stormSamples = samples.filter(({ sample }) => (
      sample.isThunderstorm || sample.precipitation > 0.5
    ))

    for (const { sample, x, y } of stormSamples) {
      const strength = Math.min(
        1,
        precipitationStrength(sample) + (sample.isThunderstorm ? 0.45 : 0)
      )

      this.context.strokeStyle = `rgba(224, 236, 255, ${0.18 + strength * 0.38})`
      this.context.lineWidth = 2.5
      this.context.beginPath()
      this.context.arc(
        x,
        y,
        74 + Math.sin(time * 2 + sample.longitude) * 12,
        time,
        time + Math.PI * 1.35
      )
      this.context.stroke()
    }

    if (
      !this.reducedMotion &&
      stormSamples.length > 0 &&
      Math.random() < deltaTime * 0.35
    ) {
      const source = stormSamples[
        Math.floor(Math.random() * stormSamples.length)
      ]

      this.spawnLightning(
        source.x + (Math.random() - 0.5) * 120,
        Math.max(0, source.y - 160)
      )
    }

    this.updateLightning(deltaTime)
  }

  private drawWindLegend() {
    const legendWidth = Math.min(360, this.width - 48)
    const x = (this.width - legendWidth) / 2
    const y = this.height - LEGEND_BOTTOM_INSET
    const gradient = this.context.createLinearGradient(x, 0, x + legendWidth, 0)

    for (let index = 0; index < WIND_COLORS.length; index += 1) {
      gradient.addColorStop(
        index / (WIND_COLORS.length - 1),
        WIND_COLORS[index]
      )
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

  private drawJetStreamLegend() {
    const legendWidth = Math.min(380, this.width - 48)
    const x = (this.width - legendWidth) / 2
    const y = this.height - LEGEND_BOTTOM_INSET
    const gradient = this.context.createLinearGradient(x, 0, x + legendWidth, 0)

    for (let index = 0; index < JET_STREAM_COLORS.length; index += 1) {
      gradient.addColorStop(
        index / (JET_STREAM_COLORS.length - 1),
        JET_STREAM_COLORS[index]
      )
    }

    this.context.fillStyle = 'rgba(10, 5, 28, 0.8)'
    this.context.beginPath()
    this.context.roundRect(x - 12, y - 27, legendWidth + 24, 59, 8)
    this.context.fill()
    this.context.font = '700 9px Inter, system-ui, sans-serif'
    this.context.textAlign = 'center'

    for (let index = 0; index < JET_STREAM_NAMES.length; index += 1) {
      this.context.fillStyle = JET_STREAM_OUTLINE_COLORS[index]
      this.context.fillText(
        JET_STREAM_NAMES[index],
        x + legendWidth * (index + 0.5) / JET_STREAM_NAMES.length,
        y - 10
      )
    }

    this.context.fillStyle = gradient
    this.context.fillRect(x, y, legendWidth, 12)
    this.context.fillStyle = 'rgba(247, 252, 255, 0.96)'
    this.context.font = '700 12px Inter, system-ui, sans-serif'
    this.context.textAlign = 'left'
    this.context.fillText('60 km/h · 250 hPa', x, y + 29)
    this.context.textAlign = 'right'
    this.context.fillText('300+ km/h', x + legendWidth, y + 29)
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

  private resetPrecipitationParticle(
    particle: Particle,
    samples: ProjectedSample[]
  ) {
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

  private isOutside(x: number, y: number, padding: number) {
    return (
      x < -padding ||
      x > this.width + padding ||
      y < -padding ||
      y > this.height + padding
    )
  }
}
