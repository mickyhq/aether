import L from 'leaflet'
import { ScreenVectorGrid } from '../ScreenVectorGrid'
import type { Particle, ProjectedSample } from '../weatherAnimationTypes'
import { precipitationStrength, windFieldAt } from '../weatherVectorFields'
import {
  PARTICLE_COUNT,
  ParticleModeRenderer,
  VECTOR_GRID_SPACING
} from './ParticleModeRenderer'

export class PrecipitationParticleRenderer extends ParticleModeRenderer {
  private vectorGrid: ScreenVectorGrid | null = null

  constructor(map: L.Map, context: CanvasRenderingContext2D) {
    super(map, context)
  }

  override reset() {
    super.reset()
    this.vectorGrid = null
  }

  draw(samples: ProjectedSample[], deltaTime: number) {
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
    const activeCount = this.getActiveCount(
      Math.min(PARTICLE_COUNT, Math.round(totalStrength * 130))
    )
    const vectorGrid = this.getVectorGrid(samples)

    this.context.save()
    this.context.lineCap = 'round'
    this.context.lineWidth = 1.15
    this.context.strokeStyle = 'rgba(194, 232, 255, 0.72)'
    this.context.beginPath()

    for (let index = 0; index < activeCount; index += 1) {
      const particle = this.particles[index]

      if (particle.life <= 0 || this.isOutside(particle.x, particle.y, 36)) {
        this.resetParticle(particle, wetSamples)
      }

      const field = vectorGrid.at(particle.x, particle.y)

      if (!field) {
        particle.life = 0
        continue
      }

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

  private resetParticle(particle: Particle, samples: ProjectedSample[]) {
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
}
