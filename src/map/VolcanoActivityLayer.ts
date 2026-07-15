import L from 'leaflet'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import {
  parseResponseJson,
  volcanoActivityResponseSchema
} from '../schemas/serverResponses'
import type {
  VolcanoActivity,
  VolcanoActivityResponse,
  VolcanoReport
} from '../schemas/serverResponses'

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 10000

export class VolcanoActivityLayer {
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
    const controller = new AbortController()

    this.abortController = controller

    try {
      const response = await fetchWithTimeout(
        '/api/volcano-activity',
        { signal: controller.signal },
        REQUEST_TIMEOUT_MS
      )

      if (!response.ok) {
        return
      }

      const payload = await parseResponseJson(
        response,
        volcanoActivityResponseSchema,
        'Volcano activity response'
      )

      if (!this.map.hasLayer(this.layer)) {
        return
      }

      this.render(payload)
    } catch {
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

  private render(payload: VolcanoActivityResponse) {
    this.layer.clearLayers()

    for (const volcano of payload.volcanoes ?? []) {
      const marker = L.marker(
        [volcano.latitude, volcano.longitude],
        {
          icon: createVolcanoIcon(volcano.activity),
          riseOnHover: true,
          riseOffset: 600,
          title: `${volcano.name}: ${volcano.activityLabel}`
        }
      )

      marker.bindTooltip(
        `${volcano.name} · ${volcano.activityLabel}`,
        { direction: 'top', offset: [0, -12] }
      )
      marker.bindPopup(buildPopup(volcano, payload), {
        maxHeight: 320,
        maxWidth: 340
      })
      marker.addTo(this.layer)
    }
  }

  private stopRefresh() {
    window.clearTimeout(this.refreshTimeout)
    this.abortController?.abort()
    this.abortController = null
  }
}

function createVolcanoIcon(activity: VolcanoActivity) {
  return L.divIcon({
    className: `volcano-activity-marker is-${activity}`,
    html: [
      '<span class="volcano-activity-pulse" aria-hidden="true"></span>',
      '<svg viewBox="0 0 34 34" aria-hidden="true" focusable="false">',
      '<path class="volcano-activity-mountain" d="M3 29 13.3 9.5l3.9 5.3 3.8-8.1L31 29Z"/>',
      '<path class="volcano-activity-crater" d="m13.3 9.5 3.9 5.3 3.8-8.1-1.2 7.1-2.8 3.4-2.7-3.1Z"/>',
      '<path class="volcano-activity-plume" d="M18.2 9.2c-2.8-2.4.4-3.8-.8-6.7 3.2 1.8 1.6 3.7 3.7 5.1 1.7 1.2.9 3.1-.7 4.1.2-1.3-.5-2.1-2.2-2.5Z"/>',
      '</svg>'
    ].join(''),
    iconSize: [34, 34],
    iconAnchor: [17, 29],
    popupAnchor: [0, -25],
    tooltipAnchor: [0, -18]
  })
}

function buildPopup(
  volcano: VolcanoReport,
  payload: VolcanoActivityResponse
) {
  const container = document.createElement('article')

  container.className = 'volcano-activity-popup'

  const heading = document.createElement('strong')

  heading.textContent = volcano.name
  container.append(heading)

  const location = document.createElement('span')

  location.className = 'volcano-activity-popup-location'
  location.textContent = volcano.country
  container.append(location)

  const status = document.createElement('span')

  status.className = `volcano-activity-popup-status is-${volcano.activity}`
  status.textContent = volcano.activityLabel
  container.append(status)

  const period = document.createElement('p')
  const publishedAt = volcano.publishedAt ?? payload.reportPublishedAt

  period.className = 'volcano-activity-popup-period'
  period.textContent = [
    `Report for ${volcano.reportPeriod}`,
    publishedAt
      ? `Published ${new Date(publishedAt).toLocaleDateString()}`
      : null
  ].filter(Boolean).join(' · ')
  container.append(period)

  const summary = document.createElement('p')

  summary.textContent = volcano.summary
  container.append(summary)

  const links = document.createElement('div')

  links.className = 'volcano-activity-popup-links'
  links.append(
    createLink(volcano.reportUrl, 'Weekly report'),
    createLink(volcano.profileUrl, 'Volcano profile')
  )
  container.append(links)

  const notice = document.createElement('small')

  notice.textContent = payload.notice ?? 'Preliminary weekly activity report.'
  container.append(notice)

  return container
}

function createLink(url: string, label: string) {
  const link = document.createElement('a')

  link.href = url
  link.target = '_blank'
  link.rel = 'noreferrer'
  link.textContent = label

  return link
}
