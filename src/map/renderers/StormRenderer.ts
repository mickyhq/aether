import type {
  LightningSegment,
  ProjectedSample
} from '../weatherAnimationTypes'
import { precipitationStrength } from '../weatherVectorFields'

export class StormRenderer {
  private lightning: LightningSegment[] = []
  private width = 1
  private height = 1
  private reducedMotion = false

  constructor(private readonly context: CanvasRenderingContext2D) {}

  setViewport(width: number, height: number, reducedMotion: boolean) {
    this.width = width
    this.height = height
    this.reducedMotion = reducedMotion
  }

  reset() {
    this.lightning = []
  }

  draw(samples: ProjectedSample[], deltaTime: number, time: number) {
    const stormSamples = samples.filter(({ sample }) => (
      sample.isThunderstorm
    ))

    for (const { sample, x, y } of stormSamples) {
      const strength = Math.min(
        1,
        precipitationStrength(sample) + (sample.isThunderstorm ? 0.45 : 0)
      )
      const pulse = this.reducedMotion
        ? 0.5
        : (Math.sin(time * 3.2 + sample.longitude) + 1) / 2
      const radius = 58 + strength * 44 + pulse * 12
      const cellGradient = this.context.createRadialGradient(
        x,
        y,
        8,
        x,
        y,
        radius
      )

      cellGradient.addColorStop(0, `rgba(94, 44, 168, ${0.2 + strength * 0.16})`)
      cellGradient.addColorStop(0.58, `rgba(59, 29, 112, ${0.13 + strength * 0.12})`)
      cellGradient.addColorStop(1, 'rgba(27, 12, 54, 0)')

      this.context.save()
      this.context.fillStyle = cellGradient
      this.context.beginPath()
      this.context.arc(x, y, radius, 0, Math.PI * 2)
      this.context.fill()

      this.context.shadowColor = 'rgba(255, 221, 87, 0.9)'
      this.context.shadowBlur = 9 + pulse * 8
      this.context.strokeStyle = `rgba(255, 224, 92, ${0.68 + strength * 0.24})`
      this.context.lineWidth = 3.2 + strength * 1.6
      this.context.setLineDash([10, 7])
      this.context.lineDashOffset = this.reducedMotion ? 0 : -time * 18
      this.context.beginPath()
      this.context.arc(x, y, radius * 0.8, 0, Math.PI * 2)
      this.context.stroke()

      this.context.shadowBlur = 0
      this.context.setLineDash([])
      this.context.strokeStyle = `rgba(188, 232, 255, ${0.58 + pulse * 0.3})`
      this.context.lineWidth = 2
      this.context.beginPath()
      this.context.arc(x, y, radius, 0, Math.PI * 2)
      this.context.stroke()
      this.drawStormBolt(x, y, strength)
      this.context.restore()
    }

    if (
      !this.reducedMotion &&
      stormSamples.length > 0 &&
      Math.random() < deltaTime * Math.min(2.4, 0.9 + stormSamples.length * 0.3)
    ) {
      const source = stormSamples[
        Math.floor(Math.random() * stormSamples.length)
      ]

      this.spawnLightning(
        source.x + (Math.random() - 0.5) * 120,
        Math.max(0, source.y - 120)
      )
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
      this.context.shadowColor = 'rgba(255, 244, 166, 0.96)'
      this.context.shadowBlur = 8
      this.context.strokeStyle = `rgba(255, 248, 198, ${segment.alpha})`
      this.context.lineWidth = 1.8 + segment.alpha * 3.2
      this.context.beginPath()
      this.context.moveTo(segment.x1, segment.y1)
      this.context.lineTo(segment.x2, segment.y2)
      this.context.stroke()
    }

    if (flash > 0) {
      this.context.shadowBlur = 0
      this.context.fillStyle = `rgba(232, 240, 255, ${flash * 0.14})`
      this.context.fillRect(0, 0, this.width, this.height)
    }
  }

  private drawStormBolt(x: number, y: number, strength: number) {
    const scale = 0.85 + strength * 0.35

    this.context.shadowColor = 'rgba(255, 239, 128, 1)'
    this.context.shadowBlur = 13
    this.context.fillStyle = '#fff08a'
    this.context.beginPath()
    this.context.moveTo(x + 5 * scale, y - 25 * scale)
    this.context.lineTo(x - 10 * scale, y + 1 * scale)
    this.context.lineTo(x - 1 * scale, y + 1 * scale)
    this.context.lineTo(x - 7 * scale, y + 26 * scale)
    this.context.lineTo(x + 13 * scale, y - 5 * scale)
    this.context.lineTo(x + 3 * scale, y - 5 * scale)
    this.context.closePath()
    this.context.fill()
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
}
