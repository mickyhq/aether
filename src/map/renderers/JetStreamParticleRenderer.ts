import L from 'leaflet'
import type { JetStreamSample } from '../../types/weather'
import { ScreenVectorGrid } from '../ScreenVectorGrid'
import {
  JET_STREAM_COLORS,
  JET_STREAM_NAMES,
  JET_STREAM_OUTLINE_COLORS
} from '../weatherPalette'
import { jetStreamBandAt, jetStreamFieldAt } from '../weatherVectorFields'
import {
  PARTICLE_COUNT,
  ParticleModeRenderer,
  VECTOR_GRID_SPACING
} from './ParticleModeRenderer'

const LEGEND_BOTTOM_INSET = 42

export class JetStreamParticleRenderer extends ParticleModeRenderer {
  private vectorGrid: ScreenVectorGrid | null = null

  constructor(map: L.Map, context: CanvasRenderingContext2D) {
    super(map, context)
  }

  override reset() {
    super.reset()
    this.vectorGrid = null
  }

  draw(samples: JetStreamSample[], deltaTime: number) {
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
      this.drawLegend()
      return
    }

    const activeCount = this.getActiveCount(
      Math.min(PARTICLE_COUNT, Math.round(260 + averageSpeed * 1.4))
    )
    const paths = JET_STREAM_OUTLINE_COLORS.map(() => (
      JET_STREAM_COLORS.map(() => new Path2D())
    ))
    const usedPaths: Array<{ stream: number, bucket: number }> = []
    const usedPathKeys = new Set<string>()
    const vectorGrid = this.getVectorGrid(samples)

    this.context.save()
    this.context.lineCap = 'round'

    for (let index = 0; index < activeCount; index += 1) {
      const particle = this.particles[index]

      if (particle.life <= 0 || this.isOutside(particle.x, particle.y, 60)) {
        this.resetFlowParticle(particle)
      }

      const field = vectorGrid.at(particle.x, particle.y)

      if (!field) {
        particle.life = 0
        continue
      }

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
      const stream = jetStreamBandAt(field.latitude ?? 0)
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
    this.drawLegend()
  }

  private getVectorGrid(samples: JetStreamSample[]) {
    if (!this.vectorGrid) {
      this.vectorGrid = new ScreenVectorGrid(
        this.width,
        this.height,
        VECTOR_GRID_SPACING,
        (x, y) => {
          const location = this.map.containerPointToLatLng([x, y])

          return {
            ...jetStreamFieldAt(location.lat, location.lng, samples),
            latitude: location.lat
          }
        }
      )
    }

    return this.vectorGrid
  }

  private drawLegend() {
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
}
