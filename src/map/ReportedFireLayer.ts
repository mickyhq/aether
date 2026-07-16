import L from 'leaflet'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import type { FireLayerStatusPatch } from './fireLayerStatus'
import type { MapFirePointer } from '../types/weather'
import { createReportedFireIcon } from './reportedFireMarker'
import { SOURCE_REFRESH_MS } from '../../shared/cachePolicy.js'
import {
  parseResponseJson,
  reportedFiresResponseSchema
} from '../schemas/serverResponses'
import type { ReportedFire } from '../schemas/serverResponses'
import {
  isPageVisible,
  subscribeToPageVisibility
} from '../utils/pageVisibility'
import type { TranslationKey } from '../i18n/translations'

const REFRESH_INTERVAL_MS = SOURCE_REFRESH_MS
const REQUEST_TIMEOUT_MS = 8000

export class ReportedFireLayer {
  private readonly layer = L.layerGroup()
  private readonly compactRenderer = L.canvas({ padding: 0.5 })
  private readonly map: L.Map
  private readonly onStatusChange: (status: FireLayerStatusPatch) => void
  private readonly onFireHover: (fire: MapFirePointer | null) => void
  private readonly t: (
    key: TranslationKey,
    values?: Record<string, string | number>
  ) => string
  private abortController: AbortController | null = null
  private fires: ReportedFire[] = []
  private refreshTimeout = 0
  private pageVisible = isPageVisible()
  private unsubscribeVisibility: (() => void) | null = null

  constructor(
    map: L.Map,
    onStatusChange: (status: FireLayerStatusPatch) => void,
    onFireHover: (fire: MapFirePointer | null) => void,
    t: ReportedFireLayer['t']
  ) {
    this.map = map
    this.onStatusChange = onStatusChange
    this.onFireHover = onFireHover
    this.t = t
  }

  getLeafletLayer() {
    return this.layer
  }

  start() {
    this.map.on('overlayadd', this.handleOverlayAdd)
    this.map.on('overlayremove', this.handleOverlayRemove)
    this.map.on('zoomend', this.handleZoomEnd)
    this.unsubscribeVisibility = subscribeToPageVisibility(
      this.handlePageVisibility
    )
  }

  destroy() {
    this.map.off('overlayadd', this.handleOverlayAdd)
    this.map.off('overlayremove', this.handleOverlayRemove)
    this.map.off('zoomend', this.handleZoomEnd)
    this.unsubscribeVisibility?.()
    this.unsubscribeVisibility = null
    this.stopRefresh()
    this.onFireHover(null)
    this.layer.clearLayers()
  }

  private readonly handleOverlayAdd = (event: L.LayersControlEvent) => {
    if (event.layer === this.layer && this.pageVisible) {
      void this.load()
    }
  }

  private readonly handleOverlayRemove = (event: L.LayersControlEvent) => {
    if (event.layer === this.layer) {
      this.stopRefresh()
      this.onFireHover(null)
    }
  }

  private readonly handleZoomEnd = () => {
    if (this.map.hasLayer(this.layer)) {
      const itemCount = this.render()

      this.onStatusChange({ itemCount })
    }
  }

  private async load() {
    if (!this.pageVisible) {
      return
    }

    this.stopRefresh()
    const controller = new AbortController()

    this.abortController = controller
    this.onStatusChange({ state: 'loading' })

    try {
      const response = await fetchWithTimeout(
        '/api/reported-fires',
        { signal: controller.signal },
        REQUEST_TIMEOUT_MS
      )

      if (!response.ok) {
        this.onStatusChange({ state: 'unavailable' })
        return
      }

      const payload = await parseResponseJson(
        response,
        reportedFiresResponseSchema,
        'Reported fires response'
      )

      if (!this.map.hasLayer(this.layer)) {
        return
      }

      this.fires = payload.fires
      const itemCount = this.render()

      this.onStatusChange({
        state: 'available',
        lastUpdated: Date.now(),
        itemCount
      })
    } catch {
      if (!controller.signal.aborted) {
        this.onStatusChange({ state: 'unavailable' })
      }
      return
    } finally {
      if (this.abortController === controller) {
        this.abortController = null
      }

      if (this.map.hasLayer(this.layer) && this.pageVisible) {
        this.refreshTimeout = window.setTimeout(
          () => void this.load(),
          REFRESH_INTERVAL_MS
        )
      }
    }
  }

  private render() {
    this.layer.clearLayers()
    const visibleFires = this.fires

    visibleFires.forEach((fire, index) => {
      const marker = this.createMarker(fire, index)

      marker.bindPopup(buildPopup(fire, this.t), { maxWidth: 280 })
      marker.on('mouseover', () => this.onFireHover(buildHoverInfo(fire, this.t)))
      marker.on('mouseout', () => this.onFireHover(null))
      marker.addTo(this.layer)
    })

    return visibleFires.length
  }

  private createMarker(fire: ReportedFire, index: number) {
    const position = L.latLng(fire.latitude, fire.longitude)

    if (this.map.getZoom() <= 10) {
      return L.circleMarker(position, {
        renderer: this.compactRenderer,
        radius: this.map.getZoom() <= 8 ? 3 : 5,
        color: '#fff0b8',
        weight: 1.5,
        fillColor: '#ff572f',
        fillOpacity: 0.88
      })
    }

    return L.marker(position, {
      icon: createReportedFireIcon(index),
      riseOnHover: true,
      riseOffset: 500
    })
  }

  private stopRefresh() {
    window.clearTimeout(this.refreshTimeout)
    this.abortController?.abort()
    this.abortController = null
  }

  private readonly handlePageVisibility = (visible: boolean) => {
    this.pageVisible = visible

    if (!visible) {
      this.stopRefresh()
    } else if (this.map.hasLayer(this.layer)) {
      void this.load()
    }
  }
}

function buildHoverInfo(fire: ReportedFire, t: ReportedFireLayer['t']): MapFirePointer {
  const details = [
    fire.magnitude,
    fire.reportedAt
      ? t('report.reportedAt', { date: new Date(fire.reportedAt).toLocaleString() })
      : null,
    fire.description
  ].filter(Boolean)

  return {
    title: fire.title,
    source: `${fire.source} · ${t('report.wildfire')}`,
    detail: details.join(' · ') || t('report.openWildfire')
  }
}

function buildPopup(fire: ReportedFire, t: ReportedFireLayer['t']) {
  const container = document.createElement('div')
  const title = document.createElement('strong')

  title.textContent = fire.title
  container.append(title)

  if (fire.description) {
    const description = document.createElement('p')

    description.textContent = fire.description
    container.append(description)
  }

  const details = [
    fire.magnitude,
    fire.reportedAt
      ? t('report.reportedAt', { date: new Date(fire.reportedAt).toLocaleString() })
      : null
  ].filter(Boolean)

  if (details.length > 0) {
    const metadata = document.createElement('p')

    metadata.textContent = details.join(' · ')
    container.append(metadata)
  }

  if (fire.sourceUrl) {
    const source = document.createElement('a')

    source.href = fire.sourceUrl
    source.target = '_blank'
    source.rel = 'noreferrer'
    source.textContent = t('report.openSource', { source: fire.source })
    container.append(source)
  }

  return container
}
