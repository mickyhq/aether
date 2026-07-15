type AnimationQuality = 'high' | 'balanced' | 'low'

const QUALITY_LEVELS: Array<{
  name: AnimationQuality
  densityScale: number
  maximumPixelRatio: number
}> = [
  { name: 'high', densityScale: 1, maximumPixelRatio: 2 },
  { name: 'balanced', densityScale: 0.72, maximumPixelRatio: 1.5 },
  { name: 'low', densityScale: 0.45, maximumPixelRatio: 1 }
]
const EVALUATION_INTERVAL_MS = 2500
const MINIMUM_SAMPLES = 60
const SLOW_FRAME_THRESHOLD_MS = 24
const FAST_FRAME_THRESHOLD_MS = 17.5

export class AnimationPerformanceController {
  private level: number
  private averageFrameTime = 16.7
  private elapsed = 0
  private samples = 0
  private fastWindows = 0

  constructor(devicePixelRatio: number) {
    this.level = devicePixelRatio >= 1.75 ? 1 : 0
  }

  get densityScale() {
    return QUALITY_LEVELS[this.level].densityScale
  }

  get pixelRatio() {
    return Math.min(
      window.devicePixelRatio || 1,
      QUALITY_LEVELS[this.level].maximumPixelRatio
    )
  }

  recordFrame(frameTime: number) {
    if (!Number.isFinite(frameTime) || frameTime <= 0 || frameTime > 100) {
      return false
    }

    const weight = this.samples < 15 ? 0.2 : 0.06

    this.averageFrameTime += (
      frameTime - this.averageFrameTime
    ) * weight
    this.elapsed += frameTime
    this.samples += 1

    if (
      this.elapsed < EVALUATION_INTERVAL_MS ||
      this.samples < MINIMUM_SAMPLES
    ) {
      return false
    }

    const previousLevel = this.level

    if (
      this.averageFrameTime > SLOW_FRAME_THRESHOLD_MS &&
      this.level < QUALITY_LEVELS.length - 1
    ) {
      this.level += 1
      this.fastWindows = 0
    } else if (
      this.averageFrameTime < FAST_FRAME_THRESHOLD_MS &&
      this.level > 0
    ) {
      this.fastWindows += 1

      if (this.fastWindows >= 3) {
        this.level -= 1
        this.fastWindows = 0
      }
    } else {
      this.fastWindows = 0
    }

    this.resetWindow()

    return previousLevel !== this.level
  }

  resetMeasurement() {
    this.fastWindows = 0
    this.resetWindow()
  }

  private resetWindow() {
    this.averageFrameTime = 16.7
    this.elapsed = 0
    this.samples = 0
  }
}
