export type ScreenVector = {
  x: number
  y: number
  speed: number
  latitude?: number
  temperature?: number
}

export class ScreenVectorGrid {
  private readonly columns: number
  private readonly rows: number
  private readonly values: Array<ScreenVector | null>

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly spacing: number,
    sample: (x: number, y: number) => ScreenVector | null
  ) {
    this.columns = Math.max(2, Math.ceil(width / spacing) + 1)
    this.rows = Math.max(2, Math.ceil(height / spacing) + 1)
    this.values = []

    for (let row = 0; row < this.rows; row += 1) {
      const y = Math.min(row * spacing, height)

      for (let column = 0; column < this.columns; column += 1) {
        const x = Math.min(column * spacing, width)

        this.values.push(sample(x, y))
      }
    }
  }

  at(x: number, y: number): ScreenVector | null {
    const clampedX = clamp(x, 0, this.width)
    const clampedY = clamp(y, 0, this.height)
    const left = Math.min(
      Math.floor(clampedX / this.spacing),
      this.columns - 2
    )
    const top = Math.min(
      Math.floor(clampedY / this.spacing),
      this.rows - 2
    )
    const right = left + 1
    const bottom = top + 1
    const leftX = Math.min(left * this.spacing, this.width)
    const rightX = Math.min(right * this.spacing, this.width)
    const topY = Math.min(top * this.spacing, this.height)
    const bottomY = Math.min(bottom * this.spacing, this.height)
    const horizontal = (clampedX - leftX) / Math.max(1, rightX - leftX)
    const vertical = (clampedY - topY) / Math.max(1, bottomY - topY)
    const points = [
      {
        value: this.read(left, top),
        weight: (1 - horizontal) * (1 - vertical)
      },
      {
        value: this.read(right, top),
        weight: horizontal * (1 - vertical)
      },
      {
        value: this.read(left, bottom),
        weight: (1 - horizontal) * vertical
      },
      { value: this.read(right, bottom), weight: horizontal * vertical }
    ]
    let vectorX = 0
    let vectorY = 0
    let speed = 0
    let latitude = 0
    let latitudeWeight = 0
    let temperature = 0
    let temperatureWeight = 0
    let totalWeight = 0

    for (const point of points) {
      if (!point.value || point.weight <= 0) {
        continue
      }

      vectorX += point.value.x * point.weight
      vectorY += point.value.y * point.weight
      speed += point.value.speed * point.weight
      totalWeight += point.weight

      if (point.value.latitude !== undefined) {
        latitude += point.value.latitude * point.weight
        latitudeWeight += point.weight
      }

      if (point.value.temperature !== undefined) {
        temperature += point.value.temperature * point.weight
        temperatureWeight += point.weight
      }
    }

    if (totalWeight === 0) {
      return null
    }

    const length = Math.hypot(vectorX, vectorY) || 1

    return {
      x: vectorX / length,
      y: vectorY / length,
      speed: speed / totalWeight,
      ...(latitudeWeight > 0
        ? { latitude: latitude / latitudeWeight }
        : {}),
      ...(temperatureWeight > 0
        ? { temperature: temperature / temperatureWeight }
        : {})
    }
  }

  private read(column: number, row: number) {
    return this.values[row * this.columns + column] ?? null
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}
