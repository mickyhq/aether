import L from 'leaflet'
import { ScreenVectorGrid } from '../ScreenVectorGrid'
import {
  OCEAN_TEMPERATURE_COLORS,
  OCEAN_TEMPERATURE_STOPS
} from '../weatherPalette'
import type {
  Particle,
  ProjectedOceanCurrentSample
} from '../weatherAnimationTypes'
import {
  ParticleModeRenderer,
  VECTOR_GRID_SPACING
} from './ParticleModeRenderer'

const LEGEND_BOTTOM_INSET = 42
const OCEAN_SPEED_STOPS = [0.3, 0.8]

export class OceanCurrentParticleRenderer extends ParticleModeRenderer {
  private vectorGrid: ScreenVectorGrid | null = null
  private readonly seaTemperatureLabel: string

  constructor(
    map: L.Map,
    context: CanvasRenderingContext2D,
    seaTemperatureLabel: string
  ) {
    super(map, context)
    this.seaTemperatureLabel = seaTemperatureLabel
  }

  override reset() {
    super.reset()
    this.vectorGrid = null
  }

  draw(samples: ProjectedOceanCurrentSample[], deltaTime: number) {
    if (samples.length === 0) {
      return
    }

    if (this.reducedMotion) {
      this.context.fillStyle = 'rgba(2, 21, 36, 0.12)'
      this.context.fillRect(0, 0, this.width, this.height)
      this.drawLegend()
      return
    }

    this.fadeFrame(deltaTime)

    const activeCount = this.getActiveCount(720)
    const paths = OCEAN_TEMPERATURE_COLORS.map(() => (
      OCEAN_SPEED_STOPS.map(() => new Path2D()).concat(new Path2D())
    ))
    const usedPaths = new Set<string>()
    const vectorGrid = this.getVectorGrid(samples)

    this.context.save()
    this.context.lineCap = 'round'

    for (let index = 0; index < activeCount; index += 1) {
      const particle = this.particles[index]

      if (particle.life <= 0 || this.isOutside(particle.x, particle.y, 40)) {
        this.resetParticle(particle, vectorGrid, index, activeCount)
      }

      const field = vectorGrid.at(particle.x, particle.y)

      if (!field || field.temperature === undefined) {
        particle.life = 0
        continue
      }

      const speed = 18 + Math.min(field.speed, 3) * 78
      const tail = 7 + Math.min(field.speed, 3) * 18

      particle.x += field.x * speed * deltaTime
      particle.y += field.y * speed * deltaTime
      particle.life -= deltaTime

      const bucket = oceanTemperatureBucket(field.temperature)
      const speedBucket = oceanSpeedBucket(field.speed)
      const path = paths[bucket][speedBucket]

      usedPaths.add(`${bucket}:${speedBucket}`)
      path.moveTo(particle.x - field.x * tail, particle.y - field.y * tail)
      path.lineTo(particle.x, particle.y)
    }

    for (const pathKey of usedPaths) {
      const [bucket, speedBucket] = pathKey.split(':').map(Number)
      const path = paths[bucket][speedBucket]

      this.context.globalAlpha = 0.7 + speedBucket * 0.15
      this.context.lineWidth = 4 + speedBucket * 1.4
      this.context.strokeStyle = 'rgba(0, 8, 16, 0.76)'
      this.context.stroke(path)
      this.context.lineWidth = 1.5 + speedBucket * 0.65
      this.context.strokeStyle = OCEAN_TEMPERATURE_COLORS[bucket]
      this.context.stroke(path)
    }

    this.context.restore()
    this.drawLegend()
  }

  private resetParticle(
    particle: Particle,
    vectorGrid: ScreenVectorGrid,
    particleIndex: number,
    particleCount: number
  ) {
    const columns = Math.max(1, Math.ceil(Math.sqrt(
      particleCount * this.width / Math.max(this.height, 1)
    )))
    const rows = Math.max(1, Math.ceil(particleCount / columns))

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const x = attempt === 0
        ? ((particleIndex % columns) + Math.random()) / columns * this.width
        : Math.random() * this.width
      const y = attempt === 0
        ? (Math.floor(particleIndex / columns) + Math.random()) / rows * this.height
        : Math.random() * this.height

      if (!vectorGrid.at(x, y)) {
        continue
      }

      particle.x = x
      particle.y = y
      particle.maxLife = 2.8 + Math.random() * 4.2
      particle.life = particle.maxLife
      return
    }

    particle.life = 0
  }

  private fadeFrame(deltaTime: number) {
    const fade = 1 - Math.exp(-deltaTime * 3.5)
    const tint = 1 - Math.exp(-deltaTime * 0.5)

    this.context.save()
    this.context.globalCompositeOperation = 'destination-out'
    this.context.fillStyle = `rgba(0, 0, 0, ${fade})`
    this.context.fillRect(0, 0, this.width, this.height)
    this.context.restore()

    this.context.fillStyle = `rgba(2, 21, 36, ${tint})`
    this.context.fillRect(0, 0, this.width, this.height)
  }

  private getVectorGrid(samples: ProjectedOceanCurrentSample[]) {
    if (!this.vectorGrid) {
      this.vectorGrid = new ScreenVectorGrid(
        this.width,
        this.height,
        VECTOR_GRID_SPACING,
        (x, y) => oceanCurrentFieldAt(x, y, samples)
      )
    }

    return this.vectorGrid
  }

  private drawLegend() {
    const legendWidth = Math.min(430, this.width - 48)
    const x = (this.width - legendWidth) / 2
    const y = this.height - LEGEND_BOTTOM_INSET
    const gradient = this.context.createLinearGradient(x, 0, x + legendWidth, 0)

    for (let index = 0; index < OCEAN_TEMPERATURE_COLORS.length; index += 1) {
      gradient.addColorStop(
        index / (OCEAN_TEMPERATURE_COLORS.length - 1),
        OCEAN_TEMPERATURE_COLORS[index]
      )
    }

    this.context.fillStyle = 'rgba(2, 12, 22, 0.82)'
    this.context.beginPath()
    this.context.roundRect(x - 12, y - 26, legendWidth + 24, 58, 8)
    this.context.fill()
    this.context.fillStyle = 'rgba(214, 242, 255, 0.9)'
    this.context.font = '700 9px Inter, system-ui, sans-serif'
    this.context.textAlign = 'left'
    this.context.fillText(this.seaTemperatureLabel, x, y - 9)
    this.context.fillStyle = gradient
    this.context.fillRect(x, y, legendWidth, 12)
    this.context.fillStyle = 'rgba(247, 252, 255, 0.96)'
    this.context.font = '700 12px Inter, system-ui, sans-serif'
    this.context.textAlign = 'left'
    this.context.fillText('-2°C', x, y + 29)
    this.context.textAlign = 'right'
    this.context.fillText('34+°C', x + legendWidth, y + 29)
  }
}

function oceanCurrentFieldAt(
  x: number,
  y: number,
  samples: ProjectedOceanCurrentSample[]
) {
  const nearest: Array<{
    distance: number
    sample: ProjectedOceanCurrentSample | null
  }> = Array.from({ length: 4 }, () => ({
    distance: Number.POSITIVE_INFINITY,
    sample: null
  }))
  let closestGridPoint: ProjectedOceanCurrentSample | null = null
  let closestGridDistance = Number.POSITIVE_INFINITY

  for (const sample of samples) {
    const deltaX = sample.x - x
    const deltaY = sample.y - y
    const distance = deltaX * deltaX + deltaY * deltaY

    if (distance < closestGridDistance) {
      closestGridPoint = sample
      closestGridDistance = distance
    }

    if (!sample.sample.ocean) {
      continue
    }

    for (let index = 0; index < nearest.length; index += 1) {
      if (distance >= nearest[index].distance) {
        continue
      }

      for (let shift = nearest.length - 1; shift > index; shift -= 1) {
        nearest[shift] = nearest[shift - 1]
      }

      nearest[index] = { distance, sample }
      break
    }
  }

  if (
    !closestGridPoint?.sample.ocean ||
    !nearest[0].sample ||
    nearest[0].distance > 180 * 180
  ) {
    return null
  }

  let eastward = 0
  let northward = 0
  let temperature = 0
  let totalWeight = 0

  for (const item of nearest) {
    if (!item.sample) {
      continue
    }

    const weight = 1 / (item.distance + 144)

    eastward += item.sample.sample.eastward * weight
    northward += item.sample.sample.northward * weight
    temperature += item.sample.sample.temperature * weight
    totalWeight += weight
  }

  if (totalWeight === 0) {
    return null
  }

  eastward /= totalWeight
  northward /= totalWeight

  const speed = Math.hypot(eastward, northward)

  if (speed < 0.005) {
    return null
  }

  return {
    x: eastward / speed,
    y: -northward / speed,
    speed,
    temperature: temperature / totalWeight
  }
}

function oceanTemperatureBucket(temperature: number) {
  const upper = OCEAN_TEMPERATURE_STOPS.findIndex(stop => temperature <= stop)

  return upper === -1 ? OCEAN_TEMPERATURE_STOPS.length - 1 : upper
}

function oceanSpeedBucket(speed: number) {
  const upper = OCEAN_SPEED_STOPS.findIndex(stop => speed <= stop)

  return upper === -1 ? OCEAN_SPEED_STOPS.length : upper
}
