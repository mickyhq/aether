import L from 'leaflet'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import type { FireLayerStatusPatch } from './fireLayerStatus'
import type { MapFirePointer } from '../types/weather'
import { createReportedFireIcon } from './reportedFireMarker'

type ReportedFire = {
  id: string
  title: string
  description: string | null
  latitude: number
  longitude: number
  reportedAt: string | null
  magnitude: string | null
  source: string
  sourceUrl: string | null
}

const REFRESH_INTERVAL_MS = 15 * 60 * 1000
const REQUEST_TIMEOUT_MS = 8000

export class ReportedFireLayer {
  private readonly layer = L.layerGroup()
  private readonly map: L.Map
  private readonly onStatusChange: (status: FireLayerStatusPatch) => void
  private readonly onFireHover: (fire: MapFirePointer | null) => void
  private abortController: AbortController | null = null
  private excludedBounds: L.LatLngBounds | null = null
  private fires: ReportedFire[] = []
  private refreshTimeout = 0

  constructor(
    map: L.Map,
    onStatusChange: (status: FireLayerStatusPatch) => void,
    onFireHover: (fire: MapFirePointer | null) => void
  ) {
    this.map = map
    this.onStatusChange = onStatusChange
    this.onFireHover = onFireHover
  }

  getLeafletLayer() {
    return this.layer
  }

  setExcludedBounds(bounds: L.LatLngBounds | null) {
    this.excludedBounds = bounds
    this.onFireHover(null)

    if (this.map.hasLayer(this.layer)) {
      const itemCount = this.render()

      this.onStatusChange({ itemCount })
    }
  }

  start() {
    this.map.on('overlayadd', this.handleOverlayAdd)
    this.map.on('overlayremove', this.handleOverlayRemove)
    this.map.on('zoomend', this.handleZoomEnd)
  }

  destroy() {
    this.map.off('overlayadd', this.handleOverlayAdd)
    this.map.off('overlayremove', this.handleOverlayRemove)
    this.map.off('zoomend', this.handleZoomEnd)
    this.stopRefresh()
    this.onFireHover(null)
    this.layer.clearLayers()
  }

  private readonly handleOverlayAdd = (event: L.LayersControlEvent) => {
    if (event.layer === this.layer) {
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

      const payload = await response.json() as { fires?: ReportedFire[] }

      if (!Array.isArray(payload.fires)) {
        this.onStatusChange({ state: 'unavailable' })
        return
      }

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

      if (this.map.hasLayer(this.layer)) {
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
      .filter(fire => (
        !this.excludedBounds ||
        !this.excludedBounds.contains([fire.latitude, fire.longitude])
      ))
      .slice(0, getMaxVisibleReportedFires(this.map.getZoom()))

    visibleFires.forEach((fire, index) => {
      const marker = L.marker([fire.latitude, fire.longitude], {
        icon: createReportedFireIcon(index),
        riseOnHover: true,
        riseOffset: 500
      })

      marker.bindPopup(buildPopup(fire), { maxWidth: 280 })
      marker.on('mouseover', () => this.onFireHover(buildHoverInfo(fire)))
      marker.on('mouseout', () => this.onFireHover(null))
      marker.addTo(this.layer)
    })

    return visibleFires.length
  }

  private stopRefresh() {
    window.clearTimeout(this.refreshTimeout)
    this.abortController?.abort()
    this.abortController = null
  }
}

function getMaxVisibleReportedFires(zoom: number) {
  if (zoom <= 8) {
    return 3
  }

  if (zoom <= 10) {
    return 20
  }

  return Number.POSITIVE_INFINITY
}

function buildHoverInfo(fire: ReportedFire): MapFirePointer {
  const details = [
    fire.magnitude,
    fire.reportedAt
      ? `Reported ${new Date(fire.reportedAt).toLocaleString()}`
      : null,
    fire.description
  ].filter(Boolean)

  return {
    title: fire.title,
    source: `${fire.source} · reported wildfire`,
    detail: details.join(' · ') || 'Open wildfire report'
  }
}

function buildPopup(fire: ReportedFire) {
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
      ? `Reported ${new Date(fire.reportedAt).toLocaleString()}`
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
    source.textContent = `Open ${fire.source} report`
    container.append(source)
  }

  return container
}
