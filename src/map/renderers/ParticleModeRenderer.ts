import L from 'leaflet'
import type { Particle } from '../weatherAnimationTypes'

export const PARTICLE_COUNT = 760
export const VECTOR_GRID_SPACING = 64

export class ParticleModeRenderer {
  protected readonly particles: Particle[]
  protected width = 1
  protected height = 1
  protected reducedMotion = false
  protected densityScale = 1

  constructor(
    protected readonly map: L.Map,
    protected readonly context: CanvasRenderingContext2D
  ) {
    this.particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: 0,
      y: 0,
      life: 0,
      maxLife: 1,
      seed: Math.random() * 1000,
      strength: 0,
      kind: 'rain'
    }))
  }

  setViewport(
    width: number,
    height: number,
    reducedMotion: boolean,
    densityScale: number
  ) {
    this.width = width
    this.height = height
    this.reducedMotion = reducedMotion
    this.densityScale = densityScale
  }

  reset() {
    for (const particle of this.particles) {
      particle.life = 0
    }
  }

  protected resetFlowParticle(particle: Particle) {
    particle.x = Math.random() * this.width
    particle.y = Math.random() * this.height
    particle.maxLife = 1.8 + Math.random() * 4
    particle.life = particle.maxLife
  }

  protected isOutside(x: number, y: number, padding: number) {
    return (
      x < -padding ||
      x > this.width + padding ||
      y < -padding ||
      y > this.height + padding
    )
  }

  protected getActiveCount(requestedCount: number) {
    return Math.max(
      0,
      Math.min(PARTICLE_COUNT, Math.round(requestedCount * this.densityScale))
    )
  }
}
