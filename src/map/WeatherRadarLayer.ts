import L from 'leaflet'
import type { PrecipitationPlayback, WeatherMode } from '../types/weather'
import { REDUCED_MOTION_QUERY } from '../utils/motion'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import { recordProviderFailure, recordProviderRequestError } from '../services/clientTelemetry'
import {
  parseResponseJson,
  radarMetadataResponseSchema
} from '../schemas/serverResponses'
import type { RadarFrame } from '../schemas/serverResponses'
import {
  isPageVisible,
  subscribeToPageVisibility
} from '../utils/pageVisibility'

const METADATA_URL = '/api/radar'
const METADATA_REFRESH = 5 * 60 * 1000
const FRAME_DURATION = 1100
const FRAME_COUNT = 6
const PANE_NAME = 'weather-radar-pane'
const MIN_NATIVE_ZOOM = 2
const MIN_ANIMATED_ZOOM = 2

export class WeatherRadarLayer {
  private map: L.Map
  private frames: RadarFrame[] = []
  private frameIndex = 0
  private currentLayer: L.TileLayer | null = null
  private loadingLayer: L.TileLayer | null = null
  private frameInterval = 0
  private metadataInterval = 0
  private metadataController: AbortController | null = null
  private visible = false
  private playback: PrecipitationPlayback = { kind: 'automatic' }
  private zooming = false
  private pageVisible = isPageVisible()
  private destroyed = false
  private unsubscribeVisibility: (() => void) | null = null
  private opacity = 0.58
  private motionQuery = window.matchMedia(REDUCED_MOTION_QUERY)
  private reducedMotion = this.motionQuery.matches
  private motionChangeHandler = (event: MediaQueryListEvent) => {
    this.reducedMotion = event.matches

    if (this.reducedMotion) {
      this.stopFrameLoop()
      this.showPlaybackFrame()
    } else if (this.visible && this.pageVisible) {
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
    this.map.on('zoomstart', this.handleZoomStart)
    this.map.on('zoomend', this.handleZoomEnd)
    this.unsubscribeVisibility = subscribeToPageVisibility(
      this.handlePageVisibility
    )
    this.startMetadataRefresh()
  }

  setMode(mode: WeatherMode) {
    const visible = mode === 'precipitation'

    if (visible === this.visible) {
      return
    }

    this.visible = visible

    if (visible && this.pageVisible) {
      this.showPlaybackFrame()
      return
    }

    this.stopFrameLoop()
    this.removeLayers()
  }

  setPlayback(playback: PrecipitationPlayback) {
    if (
      playback.kind === this.playback.kind &&
      (playback.kind !== 'radar' || (
        this.playback.kind === 'radar' &&
        playback.path === this.playback.path
      ))
    ) {
      return
    }

    this.playback = playback
    this.stopFrameLoop()
    this.loadingLayer?.remove()
    this.loadingLayer = null

    if (!this.visible || !this.pageVisible) {
      return
    }

    if (playback.kind === 'forecast') {
      this.removeLayers()
      return
    }

    this.showPlaybackFrame()
  }

  setOpacity(opacity: number) {
    this.opacity = Math.max(0, Math.min(1, opacity))
    this.currentLayer?.setOpacity(this.opacity)
  }

  destroy() {
    this.destroyed = true
    this.stopFrameLoop()
    this.stopMetadataRefresh()
    this.motionQuery.removeEventListener('change', this.motionChangeHandler)
    this.map.off('zoomstart', this.handleZoomStart)
    this.map.off('zoomend', this.handleZoomEnd)
    this.unsubscribeVisibility?.()
    this.unsubscribeVisibility = null
    this.removeLayers()
  }

  private async refreshMetadata() {
    if (!this.pageVisible || this.metadataController) {
      return
    }

    const controller = new AbortController()

    this.metadataController = controller

    try {
      const response = await fetchWithTimeout(METADATA_URL, {
        signal: controller.signal
      })

      if (!response.ok) {
        recordProviderFailure('radar')
        return
      }

      const metadata = await parseResponseJson(
        response,
        radarMetadataResponseSchema,
        'Radar metadata response'
      )

      if (
        this.destroyed ||
        controller.signal.aborted ||
        !metadata.frames?.length
      ) {
        return
      }

      this.frames = metadata.frames.slice(-FRAME_COUNT)
      this.frameIndex = this.frames.length - 1

      if (this.visible && this.pageVisible) {
        this.showPlaybackFrame()
      }
    } catch (error) {
      recordProviderRequestError('radar', error, controller.signal)
      return
    } finally {
      if (this.metadataController === controller) {
        this.metadataController = null
      }
    }
  }

  private readonly handlePageVisibility = (visible: boolean) => {
    this.pageVisible = visible

    if (!visible) {
      this.stopFrameLoop()
      this.stopMetadataRefresh()
      this.loadingLayer?.remove()
      this.loadingLayer = null
      return
    }

    this.startMetadataRefresh()

    if (this.visible) {
      this.showPlaybackFrame()
    }
  }

  private startMetadataRefresh() {
    if (!this.pageVisible || this.destroyed || this.metadataInterval) {
      return
    }

    void this.refreshMetadata()
    this.metadataInterval = window.setInterval(() => {
      void this.refreshMetadata()
    }, METADATA_REFRESH)
  }

  private stopMetadataRefresh() {
    window.clearInterval(this.metadataInterval)
    this.metadataInterval = 0
    this.metadataController?.abort()
    this.metadataController = null
  }

  private showLatestFrame() {
    if (this.frames.length === 0) {
      return
    }

    this.frameIndex = this.frames.length - 1
    this.showFrame(this.frames[this.frameIndex])
  }

  private startFrameLoop() {
    if (
      this.reducedMotion ||
      this.zooming ||
      this.map.getZoom() < MIN_ANIMATED_ZOOM ||
      this.playback.kind !== 'automatic' ||
      !this.pageVisible ||
      this.frameInterval ||
      this.frames.length < 2
    ) {
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
    if (
      !this.visible ||
      !this.pageVisible ||
      this.zooming ||
      this.loadingLayer
    ) {
      return
    }

    const url = [
      '/api/radar',
      `?path=${encodeURIComponent(frame.path)}`,
      '&z={z}&x={x}&y={y}'
    ].join('')
    let tileErrorCount = 0
    const nextLayer = L.tileLayer(url, {
      pane: PANE_NAME,
      opacity: 0,
      minNativeZoom: MIN_NATIVE_ZOOM,
      maxNativeZoom: 7,
      maxZoom: 19,
      noWrap: true,
      tileSize: 256,
      updateWhenZooming: false,
      updateWhenIdle: true,
      keepBuffer: 4,
      attribution: 'Weather radar © RainViewer'
    })

    this.loadingLayer = nextLayer
    nextLayer.on('tileerror', () => {
      tileErrorCount += 1
    })
    nextLayer.once('load', () => {
      if (
        this.destroyed ||
        !this.visible ||
        !this.pageVisible ||
        this.loadingLayer !== nextLayer
      ) {
        nextLayer.remove()
        return
      }

      if (tileErrorCount > 0) {
        nextLayer.remove()
        this.loadingLayer = null
        recordProviderFailure('radar')
        return
      }

      nextLayer.setOpacity(this.opacity)
      this.currentLayer?.remove()
      this.currentLayer = nextLayer
      this.loadingLayer = null
    })
    nextLayer.addTo(this.map)
  }

  private showPlaybackFrame() {
    if (this.playback.kind === 'forecast') {
      this.removeLayers()
      return
    }

    if (this.playback.kind === 'radar') {
      this.showFrame({
        path: this.playback.path,
        time: Date.parse(this.playback.time) / 1000
      })
      return
    }

    this.showLatestFrame()
    this.startFrameLoop()
  }

  private removeLayers() {
    this.currentLayer?.remove()
    this.loadingLayer?.remove()
    this.currentLayer = null
    this.loadingLayer = null
  }

  private readonly handleZoomStart = () => {
    if (!this.visible) {
      return
    }

    this.zooming = true
    this.stopFrameLoop()
    this.loadingLayer?.remove()
    this.loadingLayer = null
  }

  private readonly handleZoomEnd = () => {
    if (!this.zooming) {
      return
    }

    this.zooming = false

    if (
      !this.visible ||
      !this.pageVisible ||
      this.playback.kind === 'forecast' ||
      (this.playback.kind === 'automatic' && this.frames.length === 0)
    ) {
      return
    }

    if (!this.currentLayer) {
      this.showPlaybackFrame()
      return
    }

    if (this.currentLayer.isLoading()) {
      this.currentLayer.once('load', () => {
        if (!this.destroyed && this.visible && this.pageVisible) {
          this.startFrameLoop()
        }
      })
    } else {
      this.startFrameLoop()
    }
  }
}
