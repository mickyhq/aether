import {
  airQualityColor,
  temperatureColor
} from './weatherPalette'
import type {
  ProjectedAirQualitySample,
  ProjectedSample
} from './weatherAnimationTypes'

const LEGEND_BOTTOM_INSET = 80

export class WeatherFieldRenderer {
  private readonly targetCanvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private readonly temperatureCanvas = document.createElement('canvas')
  private readonly temperatureContext: CanvasRenderingContext2D
  private readonly airQualityCanvas = document.createElement('canvas')
  private readonly airQualityContext: CanvasRenderingContext2D
  private temperatureTextureDirty = true
  private airQualityTextureDirty = true
  private width = 1
  private height = 1
  private reducedMotion = false

  constructor(
    targetCanvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D
  ) {
    this.targetCanvas = targetCanvas
    this.context = context

    const temperatureContext = this.temperatureCanvas.getContext('2d')

    if (!temperatureContext) {
      throw new Error('Weather temperature canvas unavailable')
    }

    const airQualityContext = this.airQualityCanvas.getContext('2d')

    if (!airQualityContext) {
      throw new Error('Air quality canvas unavailable')
    }

    this.temperatureContext = temperatureContext
    this.airQualityContext = airQualityContext
  }

  setViewport(width: number, height: number, reducedMotion: boolean) {
    this.width = width
    this.height = height
    this.reducedMotion = reducedMotion
  }

  markDataChanged(temperatureChanged: boolean, airQualityChanged: boolean) {
    if (temperatureChanged) {
      this.temperatureTextureDirty = true
    }

    if (airQualityChanged) {
      this.airQualityTextureDirty = true
    }
  }

  invalidate() {
    this.temperatureTextureDirty = true
    this.airQualityTextureDirty = true
  }

  drawTemperature(samples: ProjectedSample[], time: number) {
    if (this.temperatureTextureDirty) {
      this.renderTemperatureTexture(samples)
    }

    const pulse = this.reducedMotion ? 0 : Math.sin(time * 0.4) * 0.025

    this.context.save()
    this.context.globalAlpha = 0.48 + pulse
    this.context.imageSmoothingEnabled = true
    this.context.drawImage(this.temperatureCanvas, 0, 0, this.width, this.height)
    this.context.restore()
    this.drawTemperatureLegend(samples)
  }

  drawAirQuality(samples: ProjectedAirQualitySample[], time: number) {
    if (this.airQualityTextureDirty) {
      this.renderAirQualityTexture(samples)
    }

    const pulse = this.reducedMotion ? 0 : Math.sin(time * 0.35) * 0.02

    this.context.save()
    this.context.globalAlpha = 0.7 + pulse
    this.context.imageSmoothingEnabled = true
    this.context.drawImage(this.airQualityCanvas, 0, 0, this.width, this.height)
    this.context.restore()
    this.drawAirQualityLegend(samples)
  }

  private renderTemperatureTexture(samples: ProjectedSample[]) {
    const startedAt = performance.now()
    const scale = 8
    const width = Math.max(1, Math.ceil(this.width / scale))
    const height = Math.max(1, Math.ceil(this.height / scale))
    const valueSamples = samples.map(projected => ({
      x: projected.x,
      y: projected.y,
      value: projected.sample.temperature
    }))

    this.temperatureCanvas.width = width
    this.temperatureCanvas.height = height

    const image = this.temperatureContext.createImageData(width, height)

    for (let row = 0; row < height; row += 1) {
      const screenY = (row + 0.5) * this.height / height

      for (let column = 0; column < width; column += 1) {
        const screenX = (column + 0.5) * this.width / width
        const temperature = interpolateNearestFour(
          screenX,
          screenY,
          valueSamples
        )
        const color = temperatureColor(temperature)
        const offset = (row * width + column) * 4

        image.data[offset] = color.r
        image.data[offset + 1] = color.g
        image.data[offset + 2] = color.b
        image.data[offset + 3] = 255
      }
    }

    this.temperatureContext.putImageData(image, 0, 0)
    this.temperatureTextureDirty = false
    this.targetCanvas.dataset.temperatureTextureMs = (
      performance.now() - startedAt
    ).toFixed(1)
  }

  private renderAirQualityTexture(samples: ProjectedAirQualitySample[]) {
    const startedAt = performance.now()
    const scale = 8
    const width = Math.max(1, Math.ceil(this.width / scale))
    const height = Math.max(1, Math.ceil(this.height / scale))
    const valueSamples = samples.map(projected => ({
      x: projected.x,
      y: projected.y,
      value: projected.sample.europeanAqi
    }))

    this.airQualityCanvas.width = width
    this.airQualityCanvas.height = height

    const image = this.airQualityContext.createImageData(width, height)

    for (let row = 0; row < height; row += 1) {
      const screenY = (row + 0.5) * this.height / height

      for (let column = 0; column < width; column += 1) {
        const screenX = (column + 0.5) * this.width / width
        const airQuality = interpolateNearestFour(
          screenX,
          screenY,
          valueSamples
        )
        const color = airQualityColor(airQuality)
        const offset = (row * width + column) * 4

        image.data[offset] = color.r
        image.data[offset + 1] = color.g
        image.data[offset + 2] = color.b
        image.data[offset + 3] = 255
      }
    }

    this.airQualityContext.putImageData(image, 0, 0)
    this.airQualityTextureDirty = false
    this.targetCanvas.dataset.airQualityTextureMs = (
      performance.now() - startedAt
    ).toFixed(1)
  }

  private drawTemperatureLegend(samples: ProjectedSample[]) {
    const temperatures = samples.map(({ sample }) => sample.temperature)
    const minimum = Math.min(...temperatures)
    const maximum = Math.max(...temperatures)
    const legendWidth = Math.min(440, this.width - 48)
    const x = (this.width - legendWidth) / 2
    const y = this.height - LEGEND_BOTTOM_INSET
    const gradient = this.context.createLinearGradient(x, 0, x + legendWidth, 0)

    for (let step = 0; step <= 12; step += 1) {
      const color = temperatureColor(-15 + step * 5)
      gradient.addColorStop(step / 12, `rgb(${color.r}, ${color.g}, ${color.b})`)
    }

    this.drawLegendFrame(x, y, legendWidth)
    this.context.fillStyle = gradient
    this.context.fillRect(x, y, legendWidth, 12)
    this.context.fillStyle = 'rgba(247, 252, 255, 0.94)'
    this.context.font = '700 12px Inter, system-ui, sans-serif'
    this.context.textAlign = 'left'
    this.context.fillText(`${Math.round(minimum)}°C`, x, y + 29)
    this.context.textAlign = 'right'
    this.context.fillText(`${Math.round(maximum)}°C`, x + legendWidth, y + 29)
  }

  private drawAirQualityLegend(samples: ProjectedAirQualitySample[]) {
    const values = samples.map(({ sample }) => sample.europeanAqi)
    const minimum = Math.min(...values)
    const maximum = Math.max(...values)
    const legendWidth = Math.min(440, this.width - 48)
    const x = (this.width - legendWidth) / 2
    const y = this.height - LEGEND_BOTTOM_INSET
    const gradient = this.context.createLinearGradient(x, 0, x + legendWidth, 0)

    for (let step = 0; step <= 10; step += 1) {
      const color = airQualityColor(step * 10)
      gradient.addColorStop(step / 10, `rgb(${color.r}, ${color.g}, ${color.b})`)
    }

    this.drawLegendFrame(x, y, legendWidth, 0.76)
    this.context.fillStyle = gradient
    this.context.fillRect(x, y, legendWidth, 12)
    this.context.fillStyle = 'rgba(247, 252, 255, 0.94)'
    this.context.font = '700 12px Inter, system-ui, sans-serif'
    this.context.textAlign = 'left'
    this.context.fillText(`Good · ${Math.round(minimum)}`, x, y + 29)
    this.context.textAlign = 'right'
    this.context.fillText(
      `${Math.round(maximum)} · Very poor`,
      x + legendWidth,
      y + 29
    )
  }

  private drawLegendFrame(
    x: number,
    y: number,
    width: number,
    alpha = 0.72
  ) {
    this.context.fillStyle = `rgba(4, 10, 15, ${alpha})`
    this.context.beginPath()
    this.context.roundRect(x - 12, y - 10, width + 24, 42, 8)
    this.context.fill()
  }
}

function interpolateNearestFour(
  x: number,
  y: number,
  samples: Array<{ x: number, y: number, value: number }>
) {
  const nearest = [
    { distance: Number.POSITIVE_INFINITY, value: 0 },
    { distance: Number.POSITIVE_INFINITY, value: 0 },
    { distance: Number.POSITIVE_INFINITY, value: 0 },
    { distance: Number.POSITIVE_INFINITY, value: 0 }
  ]

  for (const sample of samples) {
    const deltaX = sample.x - x
    const deltaY = sample.y - y
    const distance = deltaX * deltaX + deltaY * deltaY

    for (let index = 0; index < nearest.length; index += 1) {
      if (distance >= nearest[index].distance) {
        continue
      }

      for (let shift = nearest.length - 1; shift > index; shift -= 1) {
        nearest[shift] = nearest[shift - 1]
      }

      nearest[index] = { distance, value: sample.value }
      break
    }
  }

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
