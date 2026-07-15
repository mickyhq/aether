import L from 'leaflet'
import type { WeatherMode } from '../types/weather'
import { REDUCED_MOTION_QUERY } from '../utils/motion'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import {
  parseResponseJson,
  radarMetadataResponseSchema
} from '../schemas/serverResponses'
import type { RadarFrame } from '../schemas/serverResponses'

const METADATA_URL = '/api/radar'
const METADATA_REFRESH = 5 * 60 * 1000
const FRAME_DURATION = 1100
const FRAME_COUNT = 6
const PANE_NAME = 'weather-radar-pane'

export class WeatherRadarLayer {
  private map: L.Map
  private frames: RadarFrame[] = []
  private frameIndex = 0
  private currentLayer: L.TileLayer | null = null
  private loadingLayer: L.TileLayer | null = null
  private frameInterval = 0
  private metadataInterval = 0
  private visible = false
  private destroyed = false
  private opacity = 0.58
  private motionQuery = window.matchMedia(REDUCED_MOTION_QUERY)
  private reducedMotion = this.motionQuery.matches
  private motionChangeHandler = (event: MediaQueryListEvent) => {
    this.reducedMotion = event.matches

    if (this.reducedMotion) {
      this.stopFrameLoop()
      this.showLatestFrame()
    } else if (this.visible) {
      this.startFrameLoop()
    }
  }

  constructor(map: L.Map) {
    this.map = map

    if (!map.getPane(PANE_NAME)) {
      const pane = map.createPane(PANE_NAME)
      pane.style.zIndex = '420'
      pane.style.pointerEvents = 'none'
    }
  }

  start() {
    this.motionQuery.addEventListener('change', this.motionChangeHandler)
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

  setOpacity(opacity: number) {
    this.opacity = Math.max(0, Math.min(1, opacity))
    this.currentLayer?.setOpacity(this.opacity)
  }

  destroy() {
    this.destroyed = true
    this.stopFrameLoop()
    window.clearInterval(this.metadataInterval)
    this.motionQuery.removeEventListener('change', this.motionChangeHandler)
    this.removeLayers()
  }

  private async refreshMetadata() {
    try {
      const response = await fetchWithTimeout(METADATA_URL)

      if (!response.ok) {
        return
      }

      const metadata = await parseResponseJson(
        response,
        radarMetadataResponseSchema,
        'Radar metadata response'
      )

      if (this.destroyed || !metadata.frames?.length) {
        return
      }

      this.frames = metadata.frames.slice(-FRAME_COUNT)
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
    if (this.frames.length === 0) {
      return
    }

    this.frameIndex = this.frames.length - 1
    this.showFrame(this.frames[this.frameIndex])
  }

  private startFrameLoop() {
    if (this.reducedMotion || this.frameInterval || this.frames.length < 2) {
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
    if (!this.visible || this.loadingLayer) {
      return
    }

    const url = `/api/radar?path=${encodeURIComponent(frame.path)}&z={z}&x={x}&y={y}`
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

      nextLayer.setOpacity(this.opacity)
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
