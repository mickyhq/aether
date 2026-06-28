import L from 'leaflet'
import type { WeatherMode } from '../types/weather'

type RadarFrame = {
  time: number
  path: string
}

type RadarMetadata = {
  host: string
  radar: {
    past: RadarFrame[]
  }
}

const METADATA_URL = 'https://api.rainviewer.com/public/weather-maps.json'
const METADATA_REFRESH = 5 * 60 * 1000
const FRAME_DURATION = 1100
const FRAME_COUNT = 6
const PANE_NAME = 'weather-radar-pane'

export class WeatherRadarLayer {
  private map: L.Map
  private host = ''
  private frames: RadarFrame[] = []
  private frameIndex = 0
  private currentLayer: L.TileLayer | null = null
  private loadingLayer: L.TileLayer | null = null
  private frameInterval = 0
  private metadataInterval = 0
  private visible = false
  private destroyed = false

  constructor(map: L.Map) {
    this.map = map

    if (!map.getPane(PANE_NAME)) {
      const pane = map.createPane(PANE_NAME)
      pane.style.zIndex = '420'
      pane.style.pointerEvents = 'none'
    }
  }

  start() {
    void this.refreshMetadata()
    this.metadataInterval = window.setInterval(() => {
      void this.refreshMetadata()
    }, METADATA_REFRESH)
  }

  setMode(mode: WeatherMode) {
    const visible = mode === 'precipitation' || mode === 'storm'

    if (visible === this.visible) {
      return
    }

    this.visible = visible

    if (visible) {
      this.showLatestFrame()
      this.startFrameLoop()
      return
    }

    this.stopFrameLoop()
    this.removeLayers()
  }

  destroy() {
    this.destroyed = true
    this.stopFrameLoop()
    window.clearInterval(this.metadataInterval)
    this.removeLayers()
  }

  private async refreshMetadata() {
    try {
      const response = await fetch(METADATA_URL)

      if (!response.ok) {
        return
      }

      const metadata = (await response.json()) as RadarMetadata

      if (this.destroyed || !metadata.host || !metadata.radar?.past.length) {
        return
      }

      this.host = metadata.host
      this.frames = metadata.radar.past.slice(-FRAME_COUNT)
      this.frameIndex = this.frames.length - 1

      if (this.visible) {
        this.showLatestFrame()
        this.startFrameLoop()
      }
    } catch {
      return
    }
  }

  private showLatestFrame() {
    if (!this.host || this.frames.length === 0) {
      return
    }

    this.frameIndex = this.frames.length - 1
    this.showFrame(this.frames[this.frameIndex])
  }

  private startFrameLoop() {
    if (this.frameInterval || this.frames.length < 2) {
      return
    }

    this.frameInterval = window.setInterval(() => {
      if (this.loadingLayer || this.frames.length === 0) {
        return
      }

      this.frameIndex = (this.frameIndex + 1) % this.frames.length
      this.showFrame(this.frames[this.frameIndex])
    }, FRAME_DURATION)
  }

  private stopFrameLoop() {
    window.clearInterval(this.frameInterval)
    this.frameInterval = 0
  }

  private showFrame(frame: RadarFrame) {
    if (!this.visible || !this.host || this.loadingLayer) {
      return
    }

    const url = `${this.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`
    const nextLayer = L.tileLayer(url, {
      pane: PANE_NAME,
      opacity: 0,
      maxNativeZoom: 7,
      maxZoom: 19,
      tileSize: 256,
      attribution: 'Weather radar © RainViewer'
    })

    this.loadingLayer = nextLayer
    nextLayer.once('load', () => {
      if (this.destroyed || !this.visible || this.loadingLayer !== nextLayer) {
        nextLayer.remove()
        return
      }

      nextLayer.setOpacity(0.58)
      this.currentLayer?.remove()
      this.currentLayer = nextLayer
      this.loadingLayer = null
    })
    nextLayer.addTo(this.map)
  }

  private removeLayers() {
    this.currentLayer?.remove()
    this.loadingLayer?.remove()
    this.currentLayer = null
    this.loadingLayer = null
  }
}
