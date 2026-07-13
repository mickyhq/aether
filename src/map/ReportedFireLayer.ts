import L from 'leaflet'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'

type ReportedFire = {
  id: string
  title: string
  description: string | null
  latitude: number
  longitude: number
  reportedAt: string | null
  magnitude: string | null
  sourceUrl: string | null
}

const REFRESH_INTERVAL_MS = 15 * 60 * 1000
const REQUEST_TIMEOUT_MS = 8000

export class ReportedFireLayer {
  private readonly layer = L.layerGroup()
  private readonly map: L.Map
  private abortController: AbortController | null = null
  private refreshTimeout = 0

  constructor(map: L.Map) {
    this.map = map
  }

  getLeafletLayer() {
    return this.layer
  }

  start() {
    this.map.on('overlayadd', this.handleOverlayAdd)
    this.map.on('overlayremove', this.handleOverlayRemove)
  }

  destroy() {
    this.map.off('overlayadd', this.handleOverlayAdd)
    this.map.off('overlayremove', this.handleOverlayRemove)
    this.stopRefresh()
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
    }
  }

  private async load() {
    this.stopRefresh()
    this.abortController = new AbortController()

    try {
      const response = await fetchWithTimeout(
        '/api/reported-fires',
        { signal: this.abortController.signal },
        REQUEST_TIMEOUT_MS
      )

      if (!response.ok) {
        return
      }

      const payload = await response.json() as { fires?: ReportedFire[] }

      if (!Array.isArray(payload.fires) || !this.map.hasLayer(this.layer)) {
        return
      }

      this.render(payload.fires)
    } catch {
      return
    } finally {
      this.abortController = null

      if (this.map.hasLayer(this.layer)) {
        this.refreshTimeout = window.setTimeout(
          () => void this.load(),
          REFRESH_INTERVAL_MS
        )
      }
    }
  }

  private render(fires: ReportedFire[]) {
    this.layer.clearLayers()

    for (const fire of fires) {
      const marker = L.circleMarker([fire.latitude, fire.longitude], {
        radius: 7,
        color: '#fff4d6',
        weight: 2,
        fillColor: '#ef3f2f',
        fillOpacity: 0.92
      })

      marker.bindPopup(buildPopup(fire), { maxWidth: 280 })
      marker.addTo(this.layer)
    }
  }

  private stopRefresh() {
    window.clearTimeout(this.refreshTimeout)
    this.abortController?.abort()
    this.abortController = null
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
    source.textContent = 'Open source report'
    container.append(source)
  }

  return container
}
