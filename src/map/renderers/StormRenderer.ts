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
}
