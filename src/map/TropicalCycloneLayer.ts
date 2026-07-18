import L from 'leaflet'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import {
  parseResponseJson,
  tropicalCyclonesResponseSchema
} from '../schemas/serverResponses'
import type {
  TropicalCyclone,
  TropicalCyclonesResponse,
  TropicalCycloneTrackPoint
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

const REFRESH_INTERVAL_MS = 15 * 60 * 1000
const REQUEST_TIMEOUT_MS = 15000
const MAX_VISIBLE_AGE_MS = 18 * 60 * 60 * 1000

export class TropicalCycloneLayer {
  private readonly layer = L.layerGroup()
  private readonly map: L.Map
  private readonly t: (
    key: TranslationKey,
    values?: Record<string, string | number>
  ) => string
  private language: string
  private abortController: AbortController | null = null
  private refreshTimeout = 0
  private pageVisible = isPageVisible()
  private unsubscribeVisibility: (() => void) | null = null
  private payload: TropicalCyclonesResponse | null = null

  constructor(
    map: L.Map,
    language: string,
    t: TropicalCycloneLayer['t']
  ) {
    this.map = map
    this.language = language
    this.t = t
  }

  getLeafletLayer() {
    return this.layer
  }

  setLanguage(language: string) {
    this.language = language

    if (this.payload && this.map.hasLayer(this.layer)) {
      this.render(this.payload)
    }
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
        '/api/tropical-cyclones',
        { signal: controller.signal },
        REQUEST_TIMEOUT_MS
      )

      if (!response.ok) {
        recordProviderFailure('tropical-cyclones')
        this.useGraceOrClear()
        return
      }

      const payload = await parseResponseJson(
        response,
        tropicalCyclonesResponseSchema,
        'Tropical cyclone response'
      )

      if (this.map.hasLayer(this.layer)) {
        this.render(payload)
      }
    } catch (error) {
      recordProviderRequestError(
        'tropical-cyclones',
        error,
        controller.signal
      )

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

  private render(payload: TropicalCyclonesResponse) {
    const age = Date.now() - Date.parse(payload.generatedAt)

    if (!Number.isFinite(age) || age > MAX_VISIBLE_AGE_MS) {
      this.layer.clearLayers()
      this.payload = null
      return
    }

    this.payload = payload
    this.layer.clearLayers()

    for (const storm of payload.storms) {
      this.renderStorm(storm, payload)
    }
  }

  private renderStorm(
    storm: TropicalCyclone,
    payload: TropicalCyclonesResponse
  ) {
    const color = cycloneColor(storm.current.windKnots)
    const grace = payload.cacheState === 'grace'

    if (storm.cone) {
      L.geoJSON(
        {
          type: 'Feature',
          properties: {},
          geometry: storm.cone
        } as GeoJSON.Feature,
        {
          interactive: false,
          style: {
            color: grace ? '#a5a9a8' : color,
            weight: 1.25,
            opacity: 0.8,
            fillColor: color,
            fillOpacity: grace ? 0.08 : 0.13
          }
        }
      ).addTo(this.layer)
    }

    addTrack(
      this.layer,
      storm.observedTrack,
      {
        color: '#d8e1df',
        opacity: grace ? 0.38 : 0.7,
        weight: 2
      }
    )
    this.addForecastTrack(storm, payload, color, grace)

    for (const point of storm.forecast) {
      const marker = L.circleMarker(
        [point.latitude, point.longitude],
        {
          pane: 'markerPane',
          radius: 4.5,
          color: '#f8fbfa',
          weight: 1.25,
          fillColor: cycloneColor(point.windKnots),
          fillOpacity: grace ? 0.62 : 0.95
        }
      )

      marker.bindTooltip(
        this.t('cyclone.forecastTooltip', {
          name: storm.name,
          hours: point.hours,
          wind: Math.round(point.windKnots)
        }),
        { direction: 'top', offset: [0, -5] }
      )
      marker.bindPopup(this.createPopup(storm, point, payload))
      marker.addTo(this.layer)
    }

    const currentMarker = L.circleMarker(
      [storm.current.latitude, storm.current.longitude],
      {
        pane: 'markerPane',
        radius: 8,
        color: '#ffffff',
        weight: 2.5,
        fillColor: color,
        fillOpacity: grace ? 0.68 : 1
      }
    )

    currentMarker.bindTooltip(
      this.t('cyclone.currentTooltip', {
        name: storm.name,
        wind: Math.round(storm.current.windKnots)
      }),
      { direction: 'top', offset: [0, -8] }
    )
    currentMarker.bindPopup(this.createPopup(storm, storm.current, payload))
    currentMarker.addTo(this.layer)
  }

  private addForecastTrack(
    storm: TropicalCyclone,
    payload: TropicalCyclonesResponse,
    color: string,
    grace: boolean
  ) {
    const points = [storm.current, ...storm.forecast]

    for (const segment of splitTrack(points)) {
      if (segment.length < 2) {
        continue
      }

      L.polyline(segment, {
        className: 'tropical-cyclone-forecast-track-base',
        color,
        interactive: false,
        opacity: grace ? 0.42 : 0.8,
        weight: 3
      }).addTo(this.layer)

      L.polyline(segment, {
        className: 'tropical-cyclone-forecast-track',
        color: '#ffffff',
        dashArray: '1 14',
        interactive: false,
        lineCap: 'round',
        opacity: grace ? 0.48 : 0.95,
        weight: 4.5
      }).addTo(this.layer)

      const hitTrack = L.polyline(segment, {
        className: 'tropical-cyclone-forecast-hit',
        color,
        opacity: 0.001,
        weight: 18
      })

      hitTrack.bindTooltip(
        this.t('cyclone.trailTooltip', { name: storm.name }),
        { sticky: true }
      )
      hitTrack.bindPopup(() => this.createForecastPopup(storm, payload))
      hitTrack.addTo(this.layer)
    }
  }

  private createPopup(
    storm: TropicalCyclone,
    point: TropicalCycloneTrackPoint,
    payload: TropicalCyclonesResponse
  ) {
    const container = document.createElement('div')
    const title = document.createElement('strong')
    const timing = document.createElement('p')
    const intensity = document.createElement('p')
    const advisory = document.createElement('p')
    const notice = document.createElement('p')
    const source = document.createElement('a')

    container.className = 'map-event-popup'
    title.textContent = storm.name
    timing.textContent = point.hours === 0
      ? this.t('cyclone.currentPosition')
      : this.t('cyclone.forecastPosition', {
          hours: point.hours,
          time: formatDate(point.validAt, this.language)
        })
    intensity.textContent = [
      point.development,
      this.t('cyclone.wind', { wind: Math.round(point.windKnots) }),
      point.gustKnots === null
        ? null
        : this.t('cyclone.gust', { gust: Math.round(point.gustKnots) }),
      point.pressureHpa === null
        ? null
        : this.t('cyclone.pressure', {
            pressure: Math.round(point.pressureHpa)
          })
    ].filter(Boolean).join(' · ')
    advisory.textContent = this.t('cyclone.advisory', {
      number: storm.advisoryNumber ?? '—',
      time: formatDate(storm.advisoryAt, this.language)
    })
    notice.textContent = payload.cacheState === 'grace'
      ? this.t('cyclone.staleNotice')
      : this.t('cyclone.notice')
    source.href = payload.sourceUrl
    source.target = '_blank'
    source.rel = 'noreferrer'
    source.textContent = payload.source
    container.append(title, timing, intensity, advisory, notice, source)

    return container
  }

  private createForecastPopup(
    storm: TropicalCyclone,
    payload: TropicalCyclonesResponse
  ) {
    const container = document.createElement('div')
    const title = document.createElement('strong')
    const label = document.createElement('p')
    const points = document.createElement('ul')
    const notice = document.createElement('p')
    const source = document.createElement('a')

    container.className = 'map-event-popup tropical-cyclone-popup'
    title.textContent = storm.name
    label.textContent = this.t('cyclone.forecastTrail')

    for (const point of [storm.current, ...storm.forecast]) {
      const item = document.createElement('li')
      const position = point.hours === 0
        ? this.t('cyclone.currentPosition')
        : this.t('cyclone.forecastPosition', {
            hours: point.hours,
            time: formatDate(point.validAt, this.language)
          })

      item.textContent = `${position} · ${this.t('cyclone.wind', {
        wind: Math.round(point.windKnots)
      })}`
      points.append(item)
    }

    notice.textContent = payload.cacheState === 'grace'
      ? this.t('cyclone.staleNotice')
      : this.t('cyclone.notice')
    source.href = payload.sourceUrl
    source.target = '_blank'
    source.rel = 'noreferrer'
    source.textContent = payload.source
    container.append(title, label, points, notice, source)

    return container
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

    this.render({ ...this.payload, cacheState: 'grace' })
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

function addTrack(
  layer: L.LayerGroup,
  points: Array<{ latitude: number, longitude: number }>,
  options: L.PolylineOptions
) {
  for (const segment of splitTrack(points)) {
    if (segment.length >= 2) {
      L.polyline(segment, options).addTo(layer)
    }
  }
}

function splitTrack(points: Array<{ latitude: number, longitude: number }>) {
  const segments: L.LatLngExpression[][] = []
  let segment: L.LatLngExpression[] = []
  let previousLongitude: number | null = null

  for (const point of points) {
    if (
      previousLongitude !== null &&
      Math.abs(point.longitude - previousLongitude) > 180
    ) {
      if (segment.length > 0) {
        segments.push(segment)
      }

      segment = []
    }

    segment.push([point.latitude, point.longitude])
    previousLongitude = point.longitude
  }

  if (segment.length > 0) {
    segments.push(segment)
  }

  return segments
}

function cycloneColor(windKnots: number) {
  if (windKnots >= 137) return '#d946ef'
  if (windKnots >= 113) return '#ef4444'
  if (windKnots >= 96) return '#f97316'
  if (windKnots >= 83) return '#f59e0b'
  if (windKnots >= 64) return '#facc15'
  if (windKnots >= 34) return '#22d3ee'
  return '#60a5fa'
}

function formatDate(value: string, language: string) {
  const date = new Date(value)

  if (!Number.isFinite(date.getTime())) {
    return '—'
  }

  return new Intl.DateTimeFormat(language, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date)
}
