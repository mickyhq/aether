import L from 'leaflet'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import { recordProviderFailure, recordProviderRequestError } from '../services/clientTelemetry'
import {
  parseResponseJson,
  volcanoActivityResponseSchema
} from '../schemas/serverResponses'
import type {
  VolcanoActivity,
  VolcanoActivityResponse,
  VolcanoReport
} from '../schemas/serverResponses'
import {
  isPageVisible,
  subscribeToPageVisibility
} from '../utils/pageVisibility'
import type { TranslationKey } from '../i18n/translations'

const ACTIVITY_KEYS: Record<VolcanoActivity, TranslationKey> = {
  'new-eruption': 'volcano.newEruption',
  eruption: 'volcano.eruption',
  'new-unrest': 'volcano.newUnrest',
  unrest: 'volcano.unrest',
  other: 'volcano.other'
}

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 10000
const COMPACT_MARKER_MAX_ZOOM = 4
const ACTIVITY_COLORS: Record<VolcanoActivity, string> = {
  'new-eruption': '#ff5b3f',
  eruption: '#ffb04f',
  'new-unrest': '#ffd45d',
  unrest: '#e9c46a',
  other: '#e9c46a'
}

export class VolcanoActivityLayer {
  private readonly layer = L.layerGroup()
  private readonly map: L.Map
  private readonly t: (
    key: TranslationKey,
    values?: Record<string, string | number>
  ) => string
  private abortController: AbortController | null = null
  private refreshTimeout = 0
  private pageVisible = isPageVisible()
  private unsubscribeVisibility: (() => void) | null = null
  private payload: VolcanoActivityResponse | null = null
  private compactMarkers = false

  constructor(map: L.Map, t: VolcanoActivityLayer['t']) {
    this.map = map
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
    this.layer.clearLayers()
    this.payload = null
  }

  private readonly handleOverlayAdd = (event: L.LayersControlEvent) => {
    if (event.layer === this.layer && this.pageVisible) {
      void this.load()
    }
  }

  private readonly handleOverlayRemove = (event: L.LayersControlEvent) => {
    if (event.layer === this.layer) {
      this.stopRefresh()
    }
  }

  private async load() {
    if (!this.pageVisible) {
      return
    }

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
        recordProviderFailure('volcanoes')
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
    } catch (error) {
      recordProviderRequestError('volcanoes', error, controller.signal)
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

  private render(payload: VolcanoActivityResponse) {
    this.payload = payload
    this.compactMarkers = this.map.getZoom() <= COMPACT_MARKER_MAX_ZOOM
    this.layer.clearLayers()

    for (const volcano of payload.volcanoes ?? []) {
      const marker = this.compactMarkers
        ? createCompactVolcanoMarker(volcano)
        : L.marker(
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
        { direction: 'top', offset: [0, this.compactMarkers ? -6 : -12] }
      )
      marker.bindPopup(buildPopup(volcano, payload, this.t), {
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

  private readonly handlePageVisibility = (visible: boolean) => {
    this.pageVisible = visible

    if (!visible) {
      this.stopRefresh()
    } else if (this.map.hasLayer(this.layer)) {
      void this.load()
    }
  }

  private readonly handleZoomEnd = () => {
    const compactMarkers = this.map.getZoom() <= COMPACT_MARKER_MAX_ZOOM

    if (
      compactMarkers !== this.compactMarkers
      && this.payload
      && this.map.hasLayer(this.layer)
    ) {
      this.render(this.payload)
    }
  }
}

function createCompactVolcanoMarker(volcano: VolcanoReport) {
  return L.circleMarker([volcano.latitude, volcano.longitude], {
    pane: 'markerPane',
    radius: volcano.activity.startsWith('new-') ? 5 : 4,
    color: '#fff0d7',
    weight: 1.25,
    fillColor: ACTIVITY_COLORS[volcano.activity],
    fillOpacity: 0.95,
    bubblingMouseEvents: false
  })
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
  payload: VolcanoActivityResponse,
  t: VolcanoActivityLayer['t']
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
  status.textContent = t(ACTIVITY_KEYS[volcano.activity])
  container.append(status)

  const period = document.createElement('p')
  const publishedAt = volcano.publishedAt ?? payload.reportPublishedAt

  period.className = 'volcano-activity-popup-period'
  period.textContent = [
    t('volcano.reportFor', { period: volcano.reportPeriod }),
    publishedAt
      ? t('volcano.published', { date: new Date(publishedAt).toLocaleDateString() })
      : null
  ].filter(Boolean).join(' · ')
  container.append(period)

  const summary = document.createElement('p')

  summary.textContent = volcano.summary
  container.append(summary)

  const links = document.createElement('div')

  links.className = 'volcano-activity-popup-links'
  links.append(
    createLink(volcano.reportUrl, t('volcano.weeklyReport')),
    createLink(volcano.profileUrl, t('volcano.profile'))
  )
  container.append(links)

  const notice = document.createElement('small')

  notice.textContent = payload.notice ?? t('volcano.preliminary')
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
