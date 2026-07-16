import L from 'leaflet'
import type { JetStreamSample } from '../types/weather'
import type {
  ProjectedOceanCurrentSample,
  ProjectedSample
} from './weatherAnimationTypes'
import { JetStreamParticleRenderer } from './renderers/JetStreamParticleRenderer'
import { OceanCurrentParticleRenderer } from './renderers/OceanCurrentParticleRenderer'
import { PrecipitationParticleRenderer } from './renderers/PrecipitationParticleRenderer'
import { StormRenderer } from './renderers/StormRenderer'
import { WindParticleRenderer } from './renderers/WindParticleRenderer'

export class WeatherParticleRenderer {
  private readonly wind: WindParticleRenderer
  private readonly jetStream: JetStreamParticleRenderer
  private readonly oceanCurrent: OceanCurrentParticleRenderer
  private readonly precipitation: PrecipitationParticleRenderer
  private readonly storm: StormRenderer

  constructor(
    map: L.Map,
    context: CanvasRenderingContext2D,
    seaTemperatureLabel: string
  ) {
    this.wind = new WindParticleRenderer(map, context)
    this.jetStream = new JetStreamParticleRenderer(map, context)
    this.oceanCurrent = new OceanCurrentParticleRenderer(
      map,
      context,
      seaTemperatureLabel
    )
    this.precipitation = new PrecipitationParticleRenderer(map, context)
    this.storm = new StormRenderer(context)
  }

  setViewport(
    width: number,
    height: number,
    reducedMotion: boolean,
    densityScale: number
  ) {
    this.wind.setViewport(width, height, reducedMotion, densityScale)
    this.jetStream.setViewport(width, height, reducedMotion, densityScale)
    this.oceanCurrent.setViewport(width, height, reducedMotion, densityScale)
    this.precipitation.setViewport(width, height, reducedMotion, densityScale)
    this.storm.setViewport(width, height, reducedMotion)
  }

  reset() {
    this.wind.reset()
    this.jetStream.reset()
    this.oceanCurrent.reset()
    this.precipitation.reset()
    this.storm.reset()
  }

  drawWind(samples: ProjectedSample[], deltaTime: number) {
    this.wind.draw(samples, deltaTime)
  }

  drawJetStream(samples: JetStreamSample[], deltaTime: number) {
    this.jetStream.draw(samples, deltaTime)
  }

  drawOceanCurrent(
    samples: ProjectedOceanCurrentSample[],
    deltaTime: number
  ) {
    this.oceanCurrent.draw(samples, deltaTime)
  }

  drawPrecipitation(
    samples: ProjectedSample[],
    deltaTime: number,
    time: number
  ) {
    this.precipitation.draw(samples, deltaTime)
    this.storm.draw(samples, deltaTime, time)
  }
}
