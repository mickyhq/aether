import L from 'leaflet'
import { ScreenVectorGrid } from '../ScreenVectorGrid'
import { WIND_COLORS } from '../weatherPalette'
import type { ProjectedSample } from '../weatherAnimationTypes'
import { windFieldAt } from '../weatherVectorFields'
import {
  PARTICLE_COUNT,
  ParticleModeRenderer,
  VECTOR_GRID_SPACING
} from './ParticleModeRenderer'

const LEGEND_BOTTOM_INSET = 42
const WIND_BASE_SPEED_BOOST = 1.5
const WIND_MAX_ZOOM_SCALE = 8
const WIND_REFERENCE_ZOOM = 10

export class WindParticleRenderer extends ParticleModeRenderer {
  private vectorGrid: ScreenVectorGrid | null = null

  constructor(map: L.Map, context: CanvasRenderingContext2D) {
    super(map, context)
  }

  override reset() {
    super.reset()
    this.vectorGrid = null
  }

  draw(samples: ProjectedSample[], deltaTime: number) {
    const averageWind = samples.reduce(
      (sum, { sample }) => sum + sample.rawWindSpeed,
      0
    ) / samples.length

    this.context.fillStyle = `rgba(8, 35, 48, ${Math.min(0.1 + averageWind / 420, 0.24)})`
    this.context.fillRect(0, 0, this.width, this.height)

    if (this.reducedMotion) {
      this.drawLegend()
      return
    }

    const activeCount = this.getActiveCount(
      Math.min(PARTICLE_COUNT, Math.round(220 + averageWind * 8))
    )
    const paths = WIND_COLORS.map(() => new Path2D())
    const usedBuckets = new Set<number>()
    const vectorGrid = this.getVectorGrid(samples)
    const zoomScale = Math.min(
      WIND_MAX_ZOOM_SCALE,
      Math.max(0.75, 2 ** ((this.map.getZoom() - WIND_REFERENCE_ZOOM) * 0.5))
    )

    this.context.save()
    this.context.lineCap = 'round'

    for (let index = 0; index < activeCount; index += 1) {
      const particle = this.particles[index]

      if (particle.life <= 0 || this.isOutside(particle.x, particle.y, 30)) {
        this.resetFlowParticle(particle)
      }

      const field = vectorGrid.at(particle.x, particle.y)

      if (!field) {
        particle.life = 0
        continue
      }

      const speed = (
        (25 + field.speed * 2.5) *
        WIND_BASE_SPEED_BOOST *
        zoomScale
      )
      const tail = 5 + Math.min(field.speed, 80) * 0.28
      const movement = speed * deltaTime
      const streak = Math.max(tail, movement * 1.2)

      particle.x += field.x * movement
      particle.y += field.y * movement
      particle.life -= deltaTime

      const bucket = Math.min(
        WIND_COLORS.length - 1,
        Math.floor(field.speed / 12)
      )
      const path = paths[bucket]

      usedBuckets.add(bucket)
      path.moveTo(
        particle.x - field.x * streak,
        particle.y - field.y * streak
      )
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
    this.drawLegend()
  }

  private getVectorGrid(samples: ProjectedSample[]) {
    if (!this.vectorGrid) {
      this.vectorGrid = new ScreenVectorGrid(
        this.width,
        this.height,
        VECTOR_GRID_SPACING,
        (x, y) => windFieldAt(x, y, samples)
      )
    }

    return this.vectorGrid
  }

  private drawLegend() {
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
}
