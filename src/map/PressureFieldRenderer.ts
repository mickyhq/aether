import type { ProjectedSample } from './weatherAnimationTypes'

const GRID_SPACING = 44
const ISOBAR_INTERVAL = 4
const CENTER_SPACING = 180

type GridPoint = {
  x: number
  y: number
  value: number
}

type Edge = 0 | 1 | 2 | 3

type PressureCenter = GridPoint & {
  kind: 'high' | 'low'
}

export class PressureFieldRenderer {
  private readonly canvas = document.createElement('canvas')
  private readonly context: CanvasRenderingContext2D
  private width = 1
  private height = 1
  private pixelRatio = 1
  private dirty = true

  constructor(
    private readonly targetContext: CanvasRenderingContext2D,
    private readonly legendLabel: string,
    private readonly highLabel: string,
    private readonly lowLabel: string
  ) {
    const context = this.canvas.getContext('2d')

    if (!context) {
      throw new Error('Pressure field canvas unavailable')
    }

    this.context = context
  }

  setViewport(width: number, height: number, pixelRatio: number) {
    if (
      width === this.width &&
      height === this.height &&
      pixelRatio === this.pixelRatio
    ) {
      return
    }

    this.width = width
    this.height = height
    this.pixelRatio = pixelRatio
    this.dirty = true
  }

  markDataChanged(changed: boolean) {
    if (changed) {
      this.dirty = true
    }
  }

  invalidate() {
    this.dirty = true
  }

  draw(samples: ProjectedSample[]) {
    try {
      if (this.dirty) {
        this.render(samples)
      }

      this.targetContext.save()
      this.targetContext.beginPath()
      this.targetContext.rect(0, 0, this.width, Math.max(1, this.height - 72))
      this.targetContext.clip()
      this.targetContext.drawImage(
        this.canvas,
        0,
        0,
        this.width,
        this.height
      )
      this.targetContext.restore()
    } catch {
      this.targetContext.restore()
      this.context.clearRect(0, 0, this.width, this.height)
      this.dirty = false
    }
  }

  private render(samples: ProjectedSample[]) {
    this.canvas.width = Math.max(1, Math.round(this.width * this.pixelRatio))
    this.canvas.height = Math.max(1, Math.round(this.height * this.pixelRatio))
    this.context.setTransform(
      this.pixelRatio,
      0,
      0,
      this.pixelRatio,
      0,
      0
    )
    this.context.clearRect(0, 0, this.width, this.height)

    const pressureSamples = samples.flatMap(({ x, y, sample }) => (
      typeof sample.pressureMsl === 'number' &&
      Number.isFinite(sample.pressureMsl)
        ? [{ x, y, value: sample.pressureMsl }]
        : []
    ))

    if (pressureSamples.length < 2) {
      this.dirty = false
      return
    }

    const columns = Math.max(3, Math.ceil(this.width / GRID_SPACING) + 1)
    const rows = Math.max(3, Math.ceil(this.height / GRID_SPACING) + 1)
    const stepX = this.width / (columns - 1)
    const stepY = this.height / (rows - 1)
    const grid = Array.from({ length: rows }, (_, row) => (
      Array.from({ length: columns }, (_, column) => ({
        x: column * stepX,
        y: row * stepY,
        value: interpolateNearestFour(
          column * stepX,
          row * stepY,
          pressureSamples
        )
      }))
    ))
    const values = grid.flat().map(point => point.value)
    const minimum = Math.min(...values)
    const maximum = Math.max(...values)

    this.drawIsobars(grid, minimum, maximum)

    if (maximum - minimum >= 0.25) {
      this.drawCenters(findPressureCenters(grid, this.width))
    }

    this.drawCaption()
    this.dirty = false
  }

  private drawIsobars(
    grid: GridPoint[][],
    minimum: number,
    maximum: number
  ) {
    const levels = getPressureLevels(minimum, maximum)

    for (const level of levels) {
      const path = new Path2D()
      let labelPoint: GridPoint | null = null
      let labelDistance = Number.POSITIVE_INFINITY
      const emphasized = levels.length === 1 || level % 8 === 0

      for (let row = 0; row < grid.length - 1; row += 1) {
        for (let column = 0; column < grid[row].length - 1; column += 1) {
          const corners = [
            grid[row][column],
            grid[row][column + 1],
            grid[row + 1][column + 1],
            grid[row + 1][column]
          ]

          for (const [firstEdge, secondEdge] of getContourEdges(
            corners,
            level
          )) {
            const first = interpolateEdge(corners, firstEdge, level)
            const second = interpolateEdge(corners, secondEdge, level)

            path.moveTo(first.x, first.y)
            path.lineTo(second.x, second.y)

            if (emphasized) {
              const x = (first.x + second.x) / 2
              const y = (first.y + second.y) / 2
              const distance = Math.hypot(
                x - this.width / 2,
                y - this.height / 2
              )

              if (
                y > 54 &&
                y < this.height - 70 &&
                distance < labelDistance
              ) {
                labelPoint = { x, y, value: level }
                labelDistance = distance
              }
            }
          }
        }
      }

      this.context.save()
      this.context.lineJoin = 'round'
      this.context.lineCap = 'round'
      this.context.lineWidth = emphasized ? 1.35 : 0.8
      this.context.strokeStyle = emphasized
        ? 'rgba(238, 249, 255, 0.72)'
        : 'rgba(218, 239, 250, 0.46)'
      this.context.shadowColor = 'rgba(0, 13, 22, 0.85)'
      this.context.shadowBlur = 2
      this.context.stroke(path)
      this.context.restore()

      if (labelPoint) {
        this.drawIsobarLabel(labelPoint)
      }
    }
  }

  private drawIsobarLabel(point: GridPoint) {
    const text = String(Math.round(point.value))

    this.context.save()
    this.context.font = '700 9px Inter, system-ui, sans-serif'
    this.context.textAlign = 'center'
    this.context.textBaseline = 'middle'
    const width = this.context.measureText(text).width + 8

    this.context.fillStyle = 'rgba(6, 22, 31, 0.82)'
    this.context.beginPath()
    this.context.roundRect(point.x - width / 2, point.y - 7, width, 14, 4)
    this.context.fill()
    this.context.fillStyle = 'rgba(245, 251, 255, 0.94)'
    this.context.fillText(text, point.x, point.y + 0.5)
    this.context.restore()
  }

  private drawCenters(centers: PressureCenter[]) {
    for (const center of centers) {
      const isHigh = center.kind === 'high'
      const label = isHigh ? this.highLabel : this.lowLabel
      const color = isHigh ? '#68b9ff' : '#ff7474'

      this.context.save()
      this.context.translate(center.x, center.y)
      this.context.fillStyle = 'rgba(4, 18, 27, 0.82)'
      this.context.strokeStyle = color
      this.context.lineWidth = 1.5
      this.context.beginPath()
      this.context.roundRect(-23, -22, 46, 48, 12)
      this.context.fill()
      this.context.stroke()
      this.context.fillStyle = color
      this.context.font = '800 22px Inter, system-ui, sans-serif'
      this.context.textAlign = 'center'
      this.context.textBaseline = 'middle'
      this.context.fillText(label, 0, -7)
      this.context.fillStyle = 'rgba(247, 252, 255, 0.94)'
      this.context.font = '700 10px Inter, system-ui, sans-serif'
      this.context.fillText(`${Math.round(center.value)} hPa`, 0, 13)
      this.context.restore()
    }
  }

  private drawCaption() {
    const text = this.legendLabel

    this.context.save()
    this.context.font = '700 10px Inter, system-ui, sans-serif'
    this.context.textAlign = 'center'
    this.context.textBaseline = 'middle'
    const width = Math.min(
      Math.max(1, this.width - 24),
      this.context.measureText(text).width + 24
    )
    const x = this.width / 2
    const y = 18

    this.context.fillStyle = 'rgba(4, 18, 27, 0.78)'
    this.context.beginPath()
    this.context.roundRect(x - width / 2, y - 11, width, 22, 7)
    this.context.fill()
    this.context.fillStyle = 'rgba(239, 249, 255, 0.92)'
    this.context.fillText(text, x, y + 0.5, Math.max(1, width - 12))
    this.context.restore()
  }
}

function getPressureLevels(minimum: number, maximum: number) {
  const firstLevel = Math.ceil(minimum / ISOBAR_INTERVAL) * ISOBAR_INTERVAL
  const lastLevel = Math.floor(maximum / ISOBAR_INTERVAL) * ISOBAR_INTERVAL

  if (firstLevel <= lastLevel) {
    const levels: number[] = []

    for (
      let level = firstLevel;
      level <= lastLevel;
      level += ISOBAR_INTERVAL
    ) {
      levels.push(level)
    }

    return levels
  }

  return maximum - minimum >= 0.25
    ? [(minimum + maximum) / 2]
    : []
}

function findPressureCenters(
  grid: GridPoint[][],
  width: number
): PressureCenter[] {
  const highs: GridPoint[] = []
  const lows: GridPoint[] = []
  const interior: GridPoint[] = []

  for (let row = 1; row < grid.length - 1; row += 1) {
    for (let column = 1; column < grid[row].length - 1; column += 1) {
      const point = grid[row][column]
      const neighbors = grid
        .slice(row - 1, row + 2)
        .flatMap(line => line.slice(column - 1, column + 2))
        .filter(neighbor => neighbor !== point)

      interior.push(point)

      if (neighbors.every(neighbor => point.value >= neighbor.value)) {
        highs.push(point)
      }

      if (neighbors.every(neighbor => point.value <= neighbor.value)) {
        lows.push(point)
      }
    }
  }

  const maximumY = grid[grid.length - 1][0].y
  const safeInterior = interior.filter(point => (
    point.y > 72 && point.y < maximumY - 90
  ))
  const centerPool = safeInterior.length > 0 ? safeInterior : interior
  const safeHighs = highs.filter(point => centerPool.includes(point))
  const safeLows = lows.filter(point => centerPool.includes(point))
  const maximum = centerPool.reduce(
    (best, point) => point.value > best.value ? point : best,
    centerPool[0]
  )
  const minimum = centerPool.reduce(
    (best, point) => point.value < best.value ? point : best,
    centerPool[0]
  )
  const count = width >= 900 ? 2 : 1
  const selectedHighs = selectSpaced(
    safeHighs.length > 0 ? safeHighs : [maximum],
    count,
    'high'
  )
  const selectedLows = selectSpaced(
    safeLows.length > 0 ? safeLows : [minimum],
    count,
    'low'
  )

  return [...selectedHighs, ...selectedLows]
}

function selectSpaced(
  points: GridPoint[],
  count: number,
  kind: PressureCenter['kind']
) {
  const sorted = [...points].sort((first, second) => (
    kind === 'high'
      ? second.value - first.value
      : first.value - second.value
  ))
  const selected: PressureCenter[] = []

  for (const point of sorted) {
    if (
      selected.every(existing => (
        Math.hypot(point.x - existing.x, point.y - existing.y) >= CENTER_SPACING
      ))
    ) {
      selected.push({ ...point, kind })
    }

    if (selected.length === count) {
      break
    }
  }

  return selected
}

function getContourEdges(
  corners: GridPoint[],
  level: number
): Array<[Edge, Edge]> {
  const mask = corners.reduce((value, corner, index) => (
    corner.value >= level ? value | (1 << index) : value
  ), 0)
  const simpleCases: Partial<Record<number, Array<[Edge, Edge]>>> = {
    1: [[3, 0]],
    2: [[0, 1]],
    3: [[3, 1]],
    4: [[1, 2]],
    6: [[0, 2]],
    7: [[3, 2]],
    8: [[2, 3]],
    9: [[0, 2]],
    11: [[1, 2]],
    12: [[1, 3]],
    13: [[0, 1]],
    14: [[3, 0]]
  }

  if (mask === 5 || mask === 10) {
    const center = corners.reduce((sum, corner) => sum + corner.value, 0) / 4

    if (mask === 5) {
      return center >= level
        ? [[0, 1], [2, 3]]
        : [[3, 0], [1, 2]]
    }

    return center >= level
      ? [[3, 0], [1, 2]]
      : [[0, 1], [2, 3]]
  }

  return simpleCases[mask] ?? []
}

function interpolateEdge(
  corners: GridPoint[],
  edge: Edge,
  level: number
) {
  const edgeCorners: Record<Edge, [number, number]> = {
    0: [0, 1],
    1: [1, 2],
    2: [3, 2],
    3: [0, 3]
  }
  const [firstIndex, secondIndex] = edgeCorners[edge]
  const first = corners[firstIndex]
  const second = corners[secondIndex]
  const range = second.value - first.value
  const ratio = Math.max(0, Math.min(
    1,
    range === 0 ? 0.5 : (level - first.value) / range
  ))

  return {
    x: first.x + (second.x - first.x) * ratio,
    y: first.y + (second.y - first.y) * ratio
  }
}

function interpolateNearestFour(
  x: number,
  y: number,
  samples: GridPoint[]
) {
  const nearest = samples
    .map(sample => ({
      distance: (sample.x - x) ** 2 + (sample.y - y) ** 2,
      value: sample.value
    }))
    .sort((first, second) => first.distance - second.distance)
    .slice(0, 4)

  if (nearest[0].distance < 1) {
    return nearest[0].value
  }

  let weightedValue = 0
  let totalWeight = 0

  for (const sample of nearest) {
    const weight = 1 / (sample.distance + 400)

    weightedValue += sample.value * weight
    totalWeight += weight
  }

  return weightedValue / totalWeight
}
