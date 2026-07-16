import L from 'leaflet'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import {
  parseResponseJson,
  seismicEventsResponseSchema
} from '../schemas/serverResponses'
import type {
  EarthquakeEvent,
  SeismicEventsResponse,
  TsunamiWarning
} from '../schemas/serverResponses'
import {
  recordProviderFailure,
  recordProviderRequestError
} from '../services/clientTelemetry'
import {
  isPageVisible,
  subscribeToPageVisibility
} from '../utils/pageVisibility'
import type { TranslationKey } from '../i18n/translations'

const REFRESH_INTERVAL_MS = 60 * 1000
const REQUEST_TIMEOUT_MS = 15 * 1000
const MAX_VISIBLE_AGE_MS = 16 * 60 * 1000
const WARNING_GRACE_MS = 15 * 60 * 1000

const WARNING_KEYS: Record<TsunamiWarning['level'], TranslationKey> = {
  warning: 'tsunami.warning',
  advisory: 'tsunami.advisory',
  watch: 'tsunami.watch',
  threat: 'tsunami.threat'
}

export class SeismicActivityLayer {
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
  private payload: SeismicEventsResponse | null = null

  constructor(map: L.Map, t: SeismicActivityLayer['t']) {
    this.map = map
    this.t = t
  }

  getLeafletLayer() {
    return this.layer
  }

  start() {
    this.map.on('overlayadd', this.handleOverlayAdd)
    this.map.on('overlayremove', this.handleOverlayRemove)
    this.unsubscribeVisibility = subscribeToPageVisibility(
      this.handlePageVisibility
    )
  }

  destroy() {
    this.map.off('overlayadd', this.handleOverlayAdd)
    this.map.off('overlayremove', this.handleOverlayRemove)
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
        '/api/seismic-events',
        { signal: controller.signal },
        REQUEST_TIMEOUT_MS
      )

      if (!response.ok) {
        recordProviderFailure('seismic')
        this.useGraceOrClear()
        return
      }

      const payload = await parseResponseJson(
        response,
        seismicEventsResponseSchema,
        'Seismic events response'
      )

      if (this.map.hasLayer(this.layer)) {
        this.render(payload)
      }
    } catch (error) {
      recordProviderRequestError('seismic', error, controller.signal)

      if (!controller.signal.aborted) {
        this.useGraceOrClear()
      }
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

  private render(payload: SeismicEventsResponse) {
    this.payload = payload
    this.layer.clearLayers()

    for (const earthquake of payload.earthquakes) {
      createEarthquakeMarker(earthquake, this.t).addTo(this.layer)
    }

    for (const warning of visibleWarnings(payload.tsunamiWarnings)) {
      createTsunamiMarker(warning, this.t).addTo(this.layer)
    }
  }

  private useGraceOrClear() {
    if (!this.payload) {
      return
    }

    const age = Date.now() - Date.parse(this.payload.generatedAt)

    if (!Number.isFinite(age) || age > MAX_VISIBLE_AGE_MS) {
      this.layer.clearLayers()
      this.payload = null
      return
    }

    this.render({
      ...this.payload,
      cacheState: 'grace',
      tsunamiWarnings: this.payload.tsunamiWarnings.map(warning => ({
        ...warning,
        state: 'grace'
      }))
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

function createEarthquakeMarker(
  earthquake: EarthquakeEvent,
  t: SeismicActivityLayer['t']
) {
  const marker = L.circleMarker(
    [earthquake.latitude, earthquake.longitude],
    {
      pane: 'markerPane',
      radius: Math.min(14, Math.max(4, 3 + (earthquake.magnitude - 2.5) * 2.2)),
      color: earthquake.tsunamiProduct ? '#fff2b2' : '#e9f8ff',
      weight: earthquake.tsunamiProduct ? 2.5 : 1.25,
      fillColor: earthquakeColor(earthquake),
      fillOpacity: 0.88,
      bubblingMouseEvents: false
    }
  )

  marker.bindTooltip(`M ${earthquake.magnitude.toFixed(1)} · ${earthquake.place}`, {
    direction: 'top',
    offset: [0, -5]
  })
  marker.bindPopup(buildEarthquakePopup(earthquake, t), {
    maxHeight: 340,
    maxWidth: 360
  })

  return marker
}

function earthquakeColor(earthquake: EarthquakeEvent) {
  if (earthquake.alert === 'red') return '#ef3340'
  if (earthquake.alert === 'orange') return '#ff7a18'
  if (earthquake.alert === 'yellow') return '#ffd84f'
  if (earthquake.alert === 'green') return '#56c271'
  if (earthquake.magnitude >= 6) return '#ff5d3a'
  if (earthquake.magnitude >= 4.5) return '#ffb13b'

  return '#43b9e6'
}

function createTsunamiMarker(
  warning: TsunamiWarning,
  t: SeismicActivityLayer['t']
) {
  const level = t(WARNING_KEYS[warning.level])
  const marker = L.marker([warning.latitude, warning.longitude], {
    icon: createTsunamiIcon(warning),
    riseOnHover: true,
    riseOffset: 900,
    title: `${level}: ${warning.location}`
  })

  marker.bindTooltip(`${level} · ${warning.location}`, {
    direction: 'top',
    offset: [0, -16]
  })
  marker.bindPopup(buildTsunamiPopup(warning, t), {
    maxHeight: 400,
    maxWidth: 390
  })

  return marker
}

function createTsunamiIcon(warning: TsunamiWarning) {
  return L.divIcon({
    className: `tsunami-warning-marker is-${warning.level} is-${warning.state}`,
    html: [
      '<span class="tsunami-warning-pulse" aria-hidden="true"></span>',
      '<span class="tsunami-warning-symbol" aria-hidden="true">≋</span>'
    ].join(''),
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -21],
    tooltipAnchor: [0, -21]
  })
}

function buildEarthquakePopup(
  earthquake: EarthquakeEvent,
  t: SeismicActivityLayer['t']
) {
  const container = document.createElement('article')

  container.className = 'seismic-popup'
  appendText(
    container,
    'strong',
    t('seismic.earthquakeTitle', {
      magnitude: earthquake.magnitude.toFixed(1)
    })
  )
  appendText(container, 'span', earthquake.place, 'seismic-popup-location')
  appendText(
    container,
    'span',
    t('seismic.depth', { value: earthquake.depthKm.toFixed(1) }),
    'seismic-popup-meta'
  )
  appendText(
    container,
    'span',
    t('seismic.occurred', { date: formatDate(earthquake.occurredAt) }),
    'seismic-popup-meta'
  )
  appendText(
    container,
    'span',
    t('seismic.updated', { date: formatDate(earthquake.updatedAt) }),
    'seismic-popup-meta'
  )
  appendText(
    container,
    'span',
    t('seismic.status', { status: earthquake.status }),
    'seismic-popup-meta'
  )

  if (earthquake.tsunamiProduct) {
    appendText(
      container,
      'p',
      t('seismic.tsunamiProduct'),
      'seismic-popup-notice'
    )
  }

  appendLink(container, earthquake.sourceUrl, t('seismic.openEarthquake'))
  appendText(container, 'small', earthquake.source)

  return container
}

function buildTsunamiPopup(
  warning: TsunamiWarning,
  t: SeismicActivityLayer['t']
) {
  const container = document.createElement('article')

  container.className = 'seismic-popup tsunami-popup'
  appendText(
    container,
    'span',
    t(WARNING_KEYS[warning.level]),
    `tsunami-popup-level is-${warning.level}`
  )
  appendText(container, 'strong', warning.title)
  appendText(container, 'span', warning.location, 'seismic-popup-location')

  if (warning.magnitude !== null) {
    appendText(
      container,
      'span',
      t('tsunami.magnitude', { value: warning.magnitude.toFixed(1) }),
      'seismic-popup-meta'
    )
  }

  appendText(
    container,
    'span',
    t('tsunami.sent', { date: formatDate(warning.sentAt) }),
    'seismic-popup-meta'
  )

  if (warning.expiresAt) {
    appendText(
      container,
      'span',
      t('tsunami.expires', { date: formatDate(warning.expiresAt) }),
      'seismic-popup-meta'
    )
  }

  appendText(container, 'p', warning.description)

  if (warning.instructions) {
    appendText(
      container,
      'p',
      t('tsunami.instructions', { value: warning.instructions }),
      'seismic-popup-instructions'
    )
  }

  if (warning.state === 'grace') {
    appendText(container, 'p', t('tsunami.grace'), 'seismic-popup-grace')
  }

  appendLink(container, warning.sourceUrl, t('tsunami.openSource'))
  appendText(container, 'small', warning.source)

  return container
}

function visibleWarnings(warnings: TsunamiWarning[]) {
  const now = Date.now()

  return warnings.flatMap(warning => {
    if (!warning.expiresAt) {
      return [warning]
    }

    const expiredAge = now - Date.parse(warning.expiresAt)

    if (!Number.isFinite(expiredAge) || expiredAge > WARNING_GRACE_MS) {
      return []
    }

    return [{
      ...warning,
      state: warning.state === 'grace' || expiredAge > 0
        ? 'grace' as const
        : 'active' as const
    }]
  })
}

function appendText(
  parent: HTMLElement,
  tag: 'strong' | 'span' | 'p' | 'small',
  text: string,
  className?: string
) {
  const element = document.createElement(tag)

  if (className) {
    element.className = className
  }

  element.textContent = text
  parent.append(element)
}

function appendLink(parent: HTMLElement, url: string, label: string) {
  const link = document.createElement('a')

  link.href = url
  link.target = '_blank'
  link.rel = 'noreferrer'
  link.textContent = label
  parent.append(link)
}

function formatDate(value: string) {
  const date = new Date(value)

  if (!Number.isFinite(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(document.documentElement.lang || 'en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}
