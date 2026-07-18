import {
  airQualityColor,
  precipitationForecastStyle,
  temperatureAnomalyColor,
  temperatureColor
} from './weatherPalette'
import type {
  ProjectedAirQualitySample,
  ProjectedTemperatureAnomalySample,
  ProjectedSample
} from './weatherAnimationTypes'

const LEGEND_BOTTOM_INSET = 42

export class WeatherFieldRenderer {
  private readonly targetCanvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private readonly temperatureCanvas = document.createElement('canvas')
  private readonly temperatureContext: CanvasRenderingContext2D
  private readonly airQualityCanvas = document.createElement('canvas')
  private readonly airQualityContext: CanvasRenderingContext2D
  private readonly anomalyCanvas = document.createElement('canvas')
  private readonly anomalyContext: CanvasRenderingContext2D
  private readonly precipitationCanvas = document.createElement('canvas')
  private readonly precipitationContext: CanvasRenderingContext2D
  private temperatureTextureDirty = true
  private airQualityTextureDirty = true
  private anomalyTextureDirty = true
  private precipitationTextureDirty = true
  private width = 1
  private height = 1
  private reducedMotion = false

  constructor(
    targetCanvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    private readonly precipitationLegendLabel: string
  ) {
    this.targetCanvas = targetCanvas
    this.context = context

    const temperatureContext = this.temperatureCanvas.getContext('2d')

    if (!temperatureContext) {
      throw new Error('Weather temperature canvas unavailable')
    }

    const airQualityContext = this.airQualityCanvas.getContext('2d')
    const anomalyContext = this.anomalyCanvas.getContext('2d')
    const precipitationContext = this.precipitationCanvas.getContext('2d')

    if (!airQualityContext) {
      throw new Error('Air quality canvas unavailable')
    }

    if (!anomalyContext) {
      throw new Error('Temperature anomaly canvas unavailable')
    }

    if (!precipitationContext) {
      throw new Error('Precipitation forecast canvas unavailable')
    }

    this.temperatureContext = temperatureContext
    this.airQualityContext = airQualityContext
    this.anomalyContext = anomalyContext
    this.precipitationContext = precipitationContext
  }

  setViewport(width: number, height: number, reducedMotion: boolean) {
    this.width = width
    this.height = height
    this.reducedMotion = reducedMotion
  }

  markDataChanged(
    temperatureChanged: boolean,
    airQualityChanged: boolean,
    anomalyChanged: boolean
  ) {
    if (temperatureChanged) {
      this.temperatureTextureDirty = true
      this.precipitationTextureDirty = true
    }

    if (airQualityChanged) {
      this.airQualityTextureDirty = true
    }

    if (anomalyChanged) {
      this.anomalyTextureDirty = true
    }
  }

  invalidate() {
    this.temperatureTextureDirty = true
    this.airQualityTextureDirty = true
    this.anomalyTextureDirty = true
    this.precipitationTextureDirty = true
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

  drawTemperatureAnomaly(samples: ProjectedTemperatureAnomalySample[]) {
    if (this.anomalyTextureDirty) {
      this.renderTemperatureAnomalyTexture(samples)
    }

    this.context.save()
    this.context.globalAlpha = 0.68
    this.context.imageSmoothingEnabled = true
    this.context.drawImage(this.anomalyCanvas, 0, 0, this.width, this.height)
    this.context.restore()
    this.drawTemperatureAnomalyLegend()
  }

  drawPrecipitationForecast(samples: ProjectedSample[]) {
    if (this.precipitationTextureDirty) {
      this.renderPrecipitationTexture(samples)
    }

    this.context.save()
    this.context.globalAlpha = 0.82
    this.context.imageSmoothingEnabled = true
    this.context.drawImage(
      this.precipitationCanvas,
      0,
      0,
      this.width,
      this.height
    )
    this.context.restore()
  }

  drawPrecipitationForecastLegend() {
    const values = [0.1, 0.3, 1, 2.5, 5, 10, 20]
    const labels = ['0.1', '0.3', '1', '2.5', '5', '10', '20+']
    const legendWidth = Math.min(440, this.width - 48)
    const segmentWidth = legendWidth / values.length
    const x = (this.width - legendWidth) / 2
    const y = this.height - 38

    this.context.save()
    this.context.fillStyle = 'rgba(4, 10, 15, 0.82)'
    this.context.beginPath()
    this.context.roundRect(x - 12, y - 28, legendWidth + 24, 60, 8)
    this.context.fill()
    this.context.fillStyle = 'rgba(247, 252, 255, 0.94)'
    this.context.font = '700 10px Inter, system-ui, sans-serif'
    this.context.textAlign = 'left'
    this.context.fillText(this.precipitationLegendLabel, x, y - 11)

    for (let index = 0; index < values.length; index += 1) {
      const style = precipitationForecastStyle(values[index])
      const segmentX = x + index * segmentWidth

      this.context.fillStyle = `rgb(${style.r}, ${style.g}, ${style.b})`
      this.context.fillRect(segmentX, y - 4, segmentWidth + 0.5, 12)
      this.context.fillStyle = 'rgba(247, 252, 255, 0.9)'
      this.context.font = '650 9px Inter, system-ui, sans-serif'
      this.context.textAlign = 'center'
      this.context.fillText(
        labels[index],
        segmentX + segmentWidth / 2,
        y + 23
      )
    }

    this.context.restore()
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

  private renderTemperatureAnomalyTexture(
    samples: ProjectedTemperatureAnomalySample[]
  ) {
    const startedAt = performance.now()
    const scale = 8
    const width = Math.max(1, Math.ceil(this.width / scale))
    const height = Math.max(1, Math.ceil(this.height / scale))
    const valueSamples = samples.map(projected => ({
      x: projected.x,
      y: projected.y,
      value: projected.sample.anomaly
    }))

    this.anomalyCanvas.width = width
    this.anomalyCanvas.height = height

    const image = this.anomalyContext.createImageData(width, height)

    for (let row = 0; row < height; row += 1) {
      const screenY = (row + 0.5) * this.height / height

      for (let column = 0; column < width; column += 1) {
        const screenX = (column + 0.5) * this.width / width
        const anomaly = interpolateNearestFour(screenX, screenY, valueSamples)
        const color = temperatureAnomalyColor(anomaly)
        const offset = (row * width + column) * 4

        image.data[offset] = color.r
        image.data[offset + 1] = color.g
        image.data[offset + 2] = color.b
        image.data[offset + 3] = 255
      }
    }

    this.anomalyContext.putImageData(image, 0, 0)
    this.anomalyTextureDirty = false
    this.targetCanvas.dataset.temperatureAnomalyTextureMs = (
      performance.now() - startedAt
    ).toFixed(1)
  }

  private renderPrecipitationTexture(samples: ProjectedSample[]) {
    const startedAt = performance.now()
    const scale = 6
    const width = Math.max(1, Math.ceil(this.width / scale))
    const height = Math.max(1, Math.ceil(this.height / scale))
    const valueSamples = samples.map(projected => ({
      x: projected.x,
      y: projected.y,
      value: projected.sample.precipitation
    }))

    this.precipitationCanvas.width = width
    this.precipitationCanvas.height = height

    const image = this.precipitationContext.createImageData(width, height)

    for (let row = 0; row < height; row += 1) {
      const screenY = (row + 0.5) * this.height / height

      for (let column = 0; column < width; column += 1) {
        const screenX = (column + 0.5) * this.width / width
        const precipitation = interpolateNearestFour(
          screenX,
          screenY,
          valueSamples
        )
        const style = precipitationForecastStyle(precipitation)
        const offset = (row * width + column) * 4

        image.data[offset] = style.r
        image.data[offset + 1] = style.g
        image.data[offset + 2] = style.b
        image.data[offset + 3] = style.alpha
      }
    }

    this.precipitationContext.putImageData(image, 0, 0)
    this.precipitationTextureDirty = false
    this.targetCanvas.dataset.precipitationTextureMs = (
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

  private drawTemperatureAnomalyLegend() {
    const legendWidth = Math.min(440, this.width - 48)
    const x = (this.width - legendWidth) / 2
    const y = this.height - LEGEND_BOTTOM_INSET
    const gradient = this.context.createLinearGradient(x, 0, x + legendWidth, 0)

    for (let step = 0; step <= 10; step += 1) {
      const color = temperatureAnomalyColor(-10 + step * 2)

      gradient.addColorStop(step / 10, `rgb(${color.r}, ${color.g}, ${color.b})`)
    }

    this.drawLegendFrame(x, y, legendWidth)
    this.context.fillStyle = gradient
    this.context.fillRect(x, y, legendWidth, 12)
    this.context.fillStyle = 'rgba(247, 252, 255, 0.94)'
    this.context.font = '700 12px Inter, system-ui, sans-serif'
    this.context.textAlign = 'left'
    this.context.fillText('−10°C', x, y + 29)
    this.context.textAlign = 'center'
    this.context.fillText('0°C', x + legendWidth / 2, y + 29)
    this.context.textAlign = 'right'
    this.context.fillText('+10°C', x + legendWidth, y + 29)
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
