import type { WeatherConfig, WeatherEvolutionFrame, WeatherMapSample, WeatherMode, WeatherViewport } from '../types/weather'
import { normalizeLongitude } from '../utils/geo'
import { Vector2D } from './Vector2D'

type SimulationParticle = {
  position: Vector2D
  previous: Vector2D
  velocity: Vector2D
  life: number
  maxLife: number
  seed: number
}

type LightningSegment = {
  x1: number
  y1: number
  x2: number
  y2: number
  alpha: number
  width: number
}

const WIND_POOL_SIZE = 560
const PRECIPITATION_POOL_SIZE = 720
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86])

export class WeatherSimulation {
  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private getWeather: () => WeatherConfig | null
  private getMode: () => WeatherMode
  private getViewport: () => WeatherViewport | null
  private getSamples: () => WeatherMapSample[]
  private windParticles: SimulationParticle[]
  private precipitationParticles: SimulationParticle[]
  private lightningSegments: LightningSegment[] = []
  private animationFrame = 0
  private lastTime = 0
  private width = 1
  private height = 1
  private pixelRatio = 1
  private flashAlpha = 0
  private lightningClock = 0
  private resizeHandler = () => this.resize()

  constructor(
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    getWeather: () => WeatherConfig | null,
    getMode: () => WeatherMode,
    getViewport: () => WeatherViewport | null,
    getSamples: () => WeatherMapSample[]
  ) {
    this.canvas = canvas
    this.context = context
    this.getWeather = getWeather
    this.getMode = getMode
    this.getViewport = getViewport
    this.getSamples = getSamples
    this.windParticles = this.createPool(WIND_POOL_SIZE)
    this.precipitationParticles = this.createPool(PRECIPITATION_POOL_SIZE)
  }

  start() {
    this.resize()
    window.addEventListener('resize', this.resizeHandler)
    this.animationFrame = requestAnimationFrame(time => this.tick(time))
  }

  stop() {
    cancelAnimationFrame(this.animationFrame)
    window.removeEventListener('resize', this.resizeHandler)
  }

  private createPool(size: number) {
    return Array.from({ length: size }, () => ({
      position: new Vector2D(),
      previous: new Vector2D(),
      velocity: new Vector2D(),
      life: 0,
      maxLife: 1,
      seed: Math.random() * 1000
    }))
  }

  private resize() {
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.canvas.width = Math.floor(this.width * this.pixelRatio)
    this.canvas.height = Math.floor(this.height * this.pixelRatio)
    this.canvas.style.width = `${this.width}px`
    this.canvas.style.height = `${this.height}px`
    this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0)

    for (const particle of this.windParticles) {
      this.resetWindParticle(particle)
    }

    for (const particle of this.precipitationParticles) {
      this.resetPrecipitationParticle(particle)
    }
  }

  private tick(time: number) {
    const deltaTime = Math.min((time - this.lastTime) / 1000 || 0.016, 0.033)
    this.lastTime = time

    this.render(deltaTime, time / 1000)
    this.animationFrame = requestAnimationFrame(nextTime => this.tick(nextTime))
  }

  private render(deltaTime: number, time: number) {
    const weather = this.getWeather()
    const mode = this.getMode()
    const samples = this.getSamples()

    this.context.clearRect(0, 0, this.width, this.height)
    this.drawViewportField(mode, samples, time)

    this.flashAlpha *= Math.exp(-9 * deltaTime)
  }

  private drawAtmosphereTint(cloudOpacity: number, mode: WeatherMode, frame: WeatherEvolutionFrame | null, time: number) {
    const temp = frame?.temperature ?? 16
    const heat = Math.min(Math.max((temp + 5) / 40, 0), 1)
    const alpha = 0.1 + cloudOpacity * 0.18 + this.flashAlpha * 0.58
    const gradient = this.context.createLinearGradient(0, 0, 0, this.height)
    const modeGlow = mode === 'temperature' ? heat : 0.35

    gradient.addColorStop(0, `rgba(${10 + modeGlow * 55}, ${18 + modeGlow * 24}, ${26 + (1 - modeGlow) * 60}, ${alpha})`)
    gradient.addColorStop(0.55, `rgba(${18 + modeGlow * 54}, ${48 + Math.sin(time) * 6}, ${62 + (1 - modeGlow) * 56}, ${alpha * 0.6})`)
    gradient.addColorStop(1, `rgba(4, 8, 12, ${alpha * 0.8})`)

    this.context.fillStyle = gradient
    this.context.fillRect(0, 0, this.width, this.height)
  }

  private drawLocationAura(mode: WeatherMode, frame: WeatherEvolutionFrame | null, time: number) {
    const centerX = this.width * 0.5
    const centerY = this.height * 0.5
    const pulse = 0.5 + Math.sin(time * 2.2) * 0.5
    const radius = 120 + pulse * 70
    const intensity = mode === 'storm' ? 0.34 : 0.2
    const color = this.getModeColor(mode, frame)
    const gradient = this.context.createRadialGradient(centerX, centerY, 4, centerX, centerY, radius)

    gradient.addColorStop(0, `${color}${Math.round(intensity * 255).toString(16).padStart(2, '0')}`)
    gradient.addColorStop(0.45, `${color}${Math.round(intensity * 90).toString(16).padStart(2, '0')}`)
    gradient.addColorStop(1, `${color}00`)

    this.context.fillStyle = gradient
    this.context.beginPath()
    this.context.arc(centerX, centerY, radius, 0, Math.PI * 2)
    this.context.fill()
  }

  private drawViewportField(mode: WeatherMode, samples: WeatherMapSample[], time: number) {
    const viewport = this.getViewport()

    if (!viewport || samples.length === 0) {
      return
    }

    if (mode === 'temperature') {
      this.drawCityBadges(samples, viewport, sample => `${sample.estimated ? '~' : ''}${Math.round(sample.temperature)}°C`)
    }

    if (mode === 'wind') {
      this.drawCityBadges(samples, viewport, sample => `${sample.estimated ? '~' : ''}${Math.round(sample.rawWindSpeed)} km/h`)
    }

    if (mode === 'precipitation') {
      this.drawCityBadges(samples, viewport, sample => `${sample.estimated ? '~' : ''}${sample.precipitation.toFixed(1)} mm`)
    }

    if (mode === 'storm') {
      this.drawCityBadges(samples, viewport, sample => sample.isThunderstorm ? 'Storm' : 'No storm')
    }
  }

  private drawTemperatureField(samples: WeatherMapSample[], viewport: WeatherViewport, time: number) {
    const temps = samples.map(sample => sample.temperature)
    const minTemp = Math.min(...temps)
    const maxTemp = Math.max(...temps)

    for (const sample of samples) {
      const point = this.projectToScreen(sample, viewport)
      const t = (sample.temperature - minTemp) / (maxTemp - minTemp || 1)
      const color = this.temperatureColor(t)
      const radius = Math.max(this.width, this.height) * (0.22 + Math.sin(time + sample.latitude) * 0.02)
      const gradient = this.context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius)

      gradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, 0.54)`)
      gradient.addColorStop(0.48, `rgba(${color.r}, ${color.g}, ${color.b}, 0.18)`)
      gradient.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`)

      this.context.fillStyle = gradient
      this.context.fillRect(0, 0, this.width, this.height)
    }

    this.drawCityBadges(samples, viewport, sample => `${sample.estimated ? '~' : ''}${Math.round(sample.temperature)}°C`)
  }

  private drawWindField(samples: WeatherMapSample[], viewport: WeatherViewport, time: number) {
    for (const sample of samples) {
      const point = this.projectToScreen(sample, viewport)
      const length = 26 + sample.windSpeed * 62
      const pulse = Math.sin(time * 3 + sample.longitude) * 5
      const x2 = point.x + Math.cos(sample.windAngle) * (length + pulse)
      const y2 = point.y + Math.sin(sample.windAngle) * (length + pulse)

      this.context.strokeStyle = `rgba(143, 229, 255, ${0.28 + sample.windSpeed * 0.42})`
      this.context.lineWidth = 2 + sample.windSpeed * 2
      this.context.beginPath()
      this.context.moveTo(point.x, point.y)
      this.context.lineTo(x2, y2)
      this.context.stroke()

      this.context.fillStyle = `rgba(183, 245, 199, ${0.48 + sample.windSpeed * 0.35})`
      this.context.beginPath()
      this.context.arc(x2, y2, 3.5, 0, Math.PI * 2)
      this.context.fill()
    }

    this.drawCityBadges(samples, viewport, sample => `${sample.estimated ? '~' : ''}${Math.round(sample.rawWindSpeed)} km/h`)
  }

  private drawPrecipitationField(samples: WeatherMapSample[], viewport: WeatherViewport, time: number) {
    for (const sample of samples) {
      const point = this.projectToScreen(sample, viewport)
      const strength = Math.min(sample.precipitation / 8, 1)
      const radius = 90 + strength * 190 + Math.sin(time * 2 + sample.latitude) * 18
      const gradient = this.context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius)

      gradient.addColorStop(0, `rgba(90, 145, 255, ${0.12 + strength * 0.5})`)
      gradient.addColorStop(0.48, `rgba(90, 190, 255, ${0.08 + strength * 0.22})`)
      gradient.addColorStop(1, 'rgba(90, 190, 255, 0)')

      this.context.fillStyle = gradient
      this.context.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2)
    }

    this.drawCityBadges(samples.filter(sample => sample.precipitation > 0.05), viewport, sample => `${sample.estimated ? '~' : ''}${sample.precipitation.toFixed(1)} mm`)
  }

  private drawStormField(samples: WeatherMapSample[], viewport: WeatherViewport, time: number) {
    const stormSamples = samples.filter(sample => sample.isThunderstorm || sample.precipitation > 0.5)

    for (const sample of stormSamples) {
      const point = this.projectToScreen(sample, viewport)
      const strength = Math.min((sample.precipitation + (sample.isThunderstorm ? 3 : 0)) / 8, 1)

      for (let ring = 0; ring < 4; ring += 1) {
        this.context.strokeStyle = `rgba(220, 230, 255, ${0.3 - ring * 0.055})`
        this.context.lineWidth = 4 - ring * 0.5
        this.context.beginPath()
        this.context.arc(point.x, point.y, 52 + ring * 36 + strength * 70, time + ring, time + ring + Math.PI * 1.3)
        this.context.stroke()
      }
    }

    this.drawCityBadges(stormSamples, viewport, sample => sample.isThunderstorm ? 'Storm' : `${sample.estimated ? '~' : ''}${sample.precipitation.toFixed(1)} mm`)
  }

  private drawCityBadges(samples: WeatherMapSample[], viewport: WeatherViewport, format: (sample: WeatherMapSample) => string) {
    this.context.textAlign = 'left'

    for (const sample of samples) {
      const point = this.projectToScreen(sample, viewport)
      const metric = format(sample)
      const title = sample.label
      const width = Math.min(140, Math.max(82, Math.max(this.measure(title, '700 12px Inter, system-ui, sans-serif'), this.measure(metric, '800 16px Inter, system-ui, sans-serif')) + 22))
      const x = point.x + 8
      const y = point.y - 32

      this.context.fillStyle = 'rgba(4, 8, 12, 0.58)'
      this.context.beginPath()
      this.context.roundRect(x, y, width, 42, 8)
      this.context.fill()

      this.context.strokeStyle = 'rgba(190, 237, 255, 0.22)'
      this.context.lineWidth = 1
      this.context.stroke()

      this.context.fillStyle = 'rgba(230, 247, 255, 0.66)'
      this.context.font = '700 12px Inter, system-ui, sans-serif'
      this.context.fillText(title, x + 10, y + 15, width - 20)

      this.context.fillStyle = 'rgba(247, 252, 255, 0.96)'
      this.context.font = '800 16px Inter, system-ui, sans-serif'
      this.context.fillText(metric, x + 10, y + 34, width - 20)
    }
  }

  private measure(text: string, font: string) {
    this.context.font = font
    return this.context.measureText(text).width
  }

  private drawClouds(cloudOpacity: number, time: number) {
    const layerCount = Math.ceil(cloudOpacity * 5)

    for (let layer = 0; layer < layerCount; layer += 1) {
      const yBase = this.height * (0.08 + layer * 0.16)
      const drift = (time * (16 + layer * 7)) % (this.width * 0.5)
      const alpha = (0.07 + cloudOpacity * 0.16) * (1 - layer * 0.08)
      const cloudGradient = this.context.createLinearGradient(0, yBase - 80, 0, yBase + 190)

      cloudGradient.addColorStop(0, `rgba(232, 249, 255, ${alpha * 0.03})`)
      cloudGradient.addColorStop(0.48, `rgba(188, 218, 226, ${alpha})`)
      cloudGradient.addColorStop(1, `rgba(23, 44, 52, ${alpha * 0.02})`)

      this.context.fillStyle = cloudGradient
      this.context.beginPath()
      this.context.moveTo(-this.width * 0.35 - drift, yBase)

      for (let x = -this.width * 0.3; x <= this.width * 1.35; x += 42) {
        const wave = Math.sin(x * 0.01 + time * 0.55 + layer) * 34
        const roll = Math.cos(x * 0.017 - time * 0.34 + layer * 2) * 22
        this.context.lineTo(x - drift, yBase + wave + roll)
      }

      this.context.lineTo(this.width * 1.35, yBase + 230)
      this.context.lineTo(-this.width * 0.3, yBase + 230)
      this.context.closePath()
      this.context.fill()
    }
  }

  private updateWind(deltaTime: number, time: number, weather: WeatherConfig | null, emphasis: number) {
    const frame = this.getEvolutionFrame(weather, time)
    const windSpeed = frame?.windSpeed ?? weather?.windSpeed ?? 0.28
    const maxVelocity = 38 + windSpeed * 190
    const activeCount = Math.min(WIND_POOL_SIZE, Math.floor((170 + windSpeed * 390) * emphasis))

    this.context.lineWidth = 1
    this.context.strokeStyle = `rgba(150, 230, 255, ${0.09 + windSpeed * 0.26 * emphasis})`

    for (let index = 0; index < activeCount; index += 1) {
      const particle = this.windParticles[index]
      const flow = this.flowAt(particle.position.x, particle.position.y, time, frame ?? weather)

      particle.previous.set(particle.position.x, particle.position.y)
      particle.velocity.add(flow.multiply(maxVelocity * deltaTime))
      particle.velocity.multiply(0.91)
      particle.position.add(particle.velocity)
      particle.life -= deltaTime * (0.18 + windSpeed * 0.45)

      if (particle.life <= 0 || this.isOutside(particle.position, 20)) {
        this.resetWindParticle(particle)
      }

      this.context.beginPath()
      this.context.moveTo(particle.previous.x, particle.previous.y)
      this.context.lineTo(particle.position.x, particle.position.y)
      this.context.stroke()
    }
  }

  private updatePrecipitation(deltaTime: number, weather: WeatherEvolutionFrame | WeatherConfig | null) {
    const precipitation = weather?.precipitation ?? 0
    const rainDensity = Math.round(Math.min(precipitation, 12) * 58)
    const activeCount = Math.min(PRECIPITATION_POOL_SIZE, rainDensity)
    const snowing = weather ? SNOW_CODES.has(weather.weatherCode) || weather.snowfall > 0.05 : false
    const windX = Math.cos(weather?.windAngle ?? Math.PI * 0.5) * (40 + (weather?.windSpeed ?? 0.2) * 120)

    this.context.strokeStyle = 'rgba(190, 230, 255, 0.58)'
    this.context.fillStyle = 'rgba(235, 250, 255, 0.78)'
    this.context.lineWidth = 1

    for (let index = 0; index < activeCount; index += 1) {
      const particle = this.precipitationParticles[index]

      particle.previous.set(particle.position.x, particle.position.y)

      if (snowing) {
        particle.velocity.x = Math.sin(particle.seed + particle.life * 2.4) * 24 + windX * 0.16
        particle.velocity.y = 28 + (particle.seed % 30)
        particle.position.x += particle.velocity.x * deltaTime
        particle.position.y += particle.velocity.y * deltaTime

        this.context.beginPath()
        this.context.arc(particle.position.x, particle.position.y, 1.2 + (particle.seed % 1.8), 0, Math.PI * 2)
        this.context.fill()
      } else {
        particle.velocity.x = windX * 0.32
        particle.velocity.y = 520 + (particle.seed % 180)
        particle.position.x += particle.velocity.x * deltaTime
        particle.position.y += particle.velocity.y * deltaTime

        this.context.beginPath()
        this.context.moveTo(particle.position.x, particle.position.y)
        this.context.lineTo(particle.position.x - particle.velocity.x * 0.035, particle.position.y - 18)
        this.context.stroke()
      }

      if (particle.position.y > this.height + 24 || particle.position.x < -80 || particle.position.x > this.width + 80) {
        this.resetPrecipitationParticle(particle)
        particle.position.y = -Math.random() * this.height
      }
    }
  }

  private updateLightning(deltaTime: number, weather: WeatherEvolutionFrame | WeatherConfig | null, forceDrama = false) {
    if (weather?.isThunderstorm || forceDrama) {
      this.lightningClock += deltaTime
      const base = weather?.isThunderstorm ? 0.08 : 0.018
      const strikeRate = base * Math.exp(Math.min(weather?.precipitation ?? 0.4, 7) * 0.35)

      if (Math.random() < strikeRate * this.lightningClock) {
        this.spawnLightning()
        this.lightningClock = 0
      }
    }

    for (let index = this.lightningSegments.length - 1; index >= 0; index -= 1) {
      const segment = this.lightningSegments[index]
      segment.alpha -= deltaTime * 2.8

      if (segment.alpha <= 0) {
        this.lightningSegments.splice(index, 1)
        continue
      }

      this.context.strokeStyle = `rgba(230, 248, 255, ${segment.alpha})`
      this.context.lineWidth = segment.width
      this.context.beginPath()
      this.context.moveTo(segment.x1, segment.y1)
      this.context.lineTo(segment.x2, segment.y2)
      this.context.stroke()
    }
  }

  private spawnLightning() {
    const startX = Math.random() * this.width
    this.branchLightning(startX, 0, startX + (Math.random() - 0.5) * 40, 34, 0, 1)
    this.flashAlpha = 0.9
  }

  private branchLightning(x1: number, y1: number, x2: number, y2: number, depth: number, alpha: number) {
    if (y1 > this.height || depth > 24) {
      return
    }

    this.lightningSegments.push({
      x1,
      y1,
      x2,
      y2,
      alpha,
      width: Math.max(0.8, 4 - depth * 0.16)
    })

    const nextY = y2 + 22 + Math.random() * 28
    const nextX = x2 + (Math.random() - 0.5) * (70 - depth)
    this.branchLightning(x2, y2, nextX, nextY, depth + 1, alpha * 0.94)

    if (Math.random() < 0.22 && depth > 3) {
      this.branchLightning(x2, y2, x2 + (Math.random() - 0.5) * 120, nextY, depth + 4, alpha * 0.55)
    }
  }

  private flowAt(x: number, y: number, time: number, weather: WeatherEvolutionFrame | WeatherConfig | null) {
    const globalAngle = weather?.windAngle ?? Math.PI * 0.5
    const waveA = Math.sin(x * 0.008 + time * 0.8) + Math.cos(y * 0.011 - time * 0.55)
    const waveB = Math.sin((x + y) * 0.004 - time * 0.45)
    const angle = globalAngle + waveA * 0.85 + waveB * 0.55

    return new Vector2D(Math.cos(angle), Math.sin(angle)).normalize()
  }

  private resetWindParticle(particle: SimulationParticle) {
    particle.position.set(Math.random() * this.width, Math.random() * this.height)
    particle.previous.set(particle.position.x, particle.position.y)
    particle.velocity.set(0, 0)
    particle.maxLife = 2 + Math.random() * 4
    particle.life = particle.maxLife
  }

  private resetPrecipitationParticle(particle: SimulationParticle) {
    particle.position.set(Math.random() * this.width, Math.random() * this.height)
    particle.previous.set(particle.position.x, particle.position.y)
    particle.velocity.set(0, 0)
    particle.maxLife = 1
    particle.life = 1
  }

  private isOutside(position: Vector2D, padding: number) {
    return position.x < -padding || position.x > this.width + padding || position.y < -padding || position.y > this.height + padding
  }

  private drawTemperatureEvolution(frame: WeatherEvolutionFrame | null, time: number) {
    const temperature = frame?.temperature ?? 16
    const heat = Math.min(Math.max((temperature + 5) / 40, 0), 1)

    for (let ring = 0; ring < 9; ring += 1) {
      const radius = 80 + ring * 42 + Math.sin(time * 1.4 + ring) * 14
      const alpha = 0.2 - ring * 0.017

      this.context.strokeStyle = heat > 0.5
        ? `rgba(255, ${120 + heat * 90}, 82, ${alpha})`
        : `rgba(105, 208, 255, ${alpha})`
      this.context.lineWidth = 2
      this.context.beginPath()
      this.context.arc(this.width * 0.5, this.height * 0.5, radius, 0, Math.PI * 2)
      this.context.stroke()
    }

    this.context.fillStyle = heat > 0.5 ? 'rgba(255, 224, 160, 0.86)' : 'rgba(205, 242, 255, 0.86)'
    this.context.font = '700 42px Inter, system-ui, sans-serif'
    this.context.textAlign = 'center'
    this.context.fillText(`${Math.round(temperature)}°C`, this.width * 0.5, this.height * 0.5 + 14)
  }

  private drawWindRings(frame: WeatherEvolutionFrame | null, time: number) {
    const wind = frame?.rawWindSpeed ?? 0
    const angle = frame?.windAngle ?? 0
    const centerX = this.width * 0.5
    const centerY = this.height * 0.5

    this.context.save()
    this.context.translate(centerX, centerY)
    this.context.rotate(angle)

    for (let band = 0; band < 8; band += 1) {
      const offset = ((time * (80 + wind * 4) + band * 78) % (this.width * 0.9)) - this.width * 0.45
      const alpha = 0.26 - band * 0.018

      this.context.strokeStyle = `rgba(143, 229, 255, ${alpha})`
      this.context.lineWidth = 2
      this.context.beginPath()
      this.context.moveTo(offset, -this.height * 0.34 + band * 28)
      this.context.bezierCurveTo(offset + 90, -80, offset - 60, 80, offset + 120, this.height * 0.34)
      this.context.stroke()
    }

    this.context.restore()
  }

  private drawStormCells(frame: WeatherEvolutionFrame | null, time: number) {
    const centerX = this.width * 0.5
    const centerY = this.height * 0.5
    const power = Math.min((frame?.precipitation ?? 1) / 8, 1)

    for (let cell = 0; cell < 5; cell += 1) {
      const radius = 130 + cell * 55 + Math.sin(time * 2 + cell) * 18
      const start = time * 0.8 + cell
      const end = start + Math.PI * (0.55 + power * 0.8)

      this.context.strokeStyle = `rgba(210, 235, 255, ${0.24 - cell * 0.032})`
      this.context.lineWidth = 4 - cell * 0.35
      this.context.beginPath()
      this.context.arc(centerX, centerY, radius, start, end)
      this.context.stroke()
    }
  }

  private getEvolutionFrame(weather: WeatherConfig | null, time: number) {
    if (!weather?.evolution.length) {
      return null
    }

    const progress = (time * 0.22) % weather.evolution.length
    const index = Math.floor(progress)

    return weather.evolution[index]
  }

  private getModeColor(mode: WeatherMode, frame: WeatherEvolutionFrame | null) {
    if (mode === 'temperature') {
      return (frame?.temperature ?? 16) > 18 ? '#ff955f' : '#76d9ff'
    }

    if (mode === 'wind') {
      return '#8fe5ff'
    }

    if (mode === 'precipitation') {
      return '#9cc7ff'
    }

    return '#d9e8ff'
  }

  private projectToScreen(sample: WeatherMapSample, viewport: WeatherViewport) {
    const west = normalizeLongitude(viewport.west)
    const east = normalizeLongitude(viewport.east)
    const lon = normalizeLongitude(sample.longitude)
    const crossesDateLine = east < west
    const adjustedLon = crossesDateLine && lon < west ? lon + 360 : lon
    const adjustedEast = crossesDateLine ? east + 360 : east
    const x = (adjustedLon - west) / (adjustedEast - west || 1)
    const y = (viewport.north - sample.latitude) / (viewport.north - viewport.south || 1)

    return {
      x: x * this.width,
      y: y * this.height
    }
  }

  private temperatureColor(value: number) {
    if (value < 0.33) {
      return {
        r: Math.round(70 + value * 240),
        g: Math.round(150 + value * 170),
        b: 255
      }
    }

    if (value < 0.66) {
      const t = (value - 0.33) / 0.33

      return {
        r: Math.round(110 + t * 120),
        g: Math.round(230 - t * 20),
        b: Math.round(190 - t * 120)
      }
    }

    const t = (value - 0.66) / 0.34

    return {
      r: 255,
      g: Math.round(190 - t * 100),
      b: Math.round(80 - t * 50)
    }
  }

}
