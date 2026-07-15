import L from 'leaflet'
import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import type { MapFirePointer, WeatherMode } from '../types/weather'
import {
  fireLayerStatusResponseSchema,
  parseResponseJson
} from '../schemas/serverResponses'
import { findFireTileAtPoint } from './fireTileHitTest'
import type { FireLayerId, FireLayerStatusPatch } from './fireLayerStatus'
import { addLayerControlInfo } from './layerControlInfo'
import { addBaseMap } from './baseMap'
import {
  loadEnabledMapOverlays,
  saveEnabledMapOverlays
} from './mapOverlayState'
import type { MapOverlayId } from './mapOverlayState'
import { ReportedFireLayer } from './ReportedFireLayer'
import {
  clipTileToBounds,
  maskTileToBounds
} from './regionalTileClip'
import { VolcanoActivityLayer } from './VolcanoActivityLayer'
import { WeatherRadarLayer } from './WeatherRadarLayer'

const AFRICA_FIRE_BOUNDS = L.latLngBounds([-35, -20], [40, 55])
const EUROPE_FIRE_BOUNDS = L.latLngBounds([40, -25], [72, 45])
const FIRE_LAYER_DESCRIPTION = [
  'Satellite heat detections from the last 24 hours.',
  'They may include extinguished fires or other hot sources,',
  'and clouds can hide active fires.'
].join(' ')
const FIRMS_HOVER_INFO: MapFirePointer = {
  title: 'Worldwide heat detection',
  source: 'NASA FIRMS · VIIRS',
  detail: 'Detected within the last 24 hours. Not a confirmed active fire.'
}
const AFRICA_EFFIS_HOVER_INFO: MapFirePointer = {
  title: 'Africa heat detection',
  source: 'Copernicus EFFIS · VIIRS',
  detail: 'Detected today or yesterday. Not a confirmed active fire.'
}
const EUROPE_EFFIS_HOVER_INFO: MapFirePointer = {
  title: 'Europe heat detection',
  source: 'Copernicus EFFIS · VIIRS',
  detail: 'Detected today or yesterday. Not a confirmed active fire.'
}

type AetherMapLayersOptions = {
  map: L.Map
  onReportedFirePointerChange: (blocked: boolean) => void
  updateFireLayerStatus: (
    id: FireLayerId,
    patch: FireLayerStatusPatch
  ) => void
}

export type AetherMapLayers = {
  badgeLayer: L.LayerGroup
  controlContainer: HTMLElement | null
  destroy: () => void
  findFireAtPoint: (point: L.Point) => MapFirePointer | null
  setWeatherMode: (mode: WeatherMode, radarOpacity: number) => void
}

export function createAetherMapLayers({
  map,
  onReportedFirePointerChange,
  updateFireLayerStatus
}: AetherMapLayersOptions): AetherMapLayers {
  const reportedFires = new ReportedFireLayer(
    map,
    status => updateFireLayerStatus('reported-wildfires', status),
    fire => onReportedFirePointerChange(Boolean(fire))
  )
  const volcanoActivity = new VolcanoActivityLayer(map)
  const fireTiles = L.tileLayer(
    '/api/fire-tile?z={z}&x={x}&y={y}',
    {
      keepBuffer: 6,
      maxNativeZoom: 12,
      maxZoom: 19,
      noWrap: true,
      opacity: 0.9,
      updateWhenIdle: true,
      updateWhenZooming: false,
      attribution: 'Worldwide heat detections NASA FIRMS'
    }
  )
  const africaFireTiles = L.tileLayer(
    '/api/effis-fire-tile?z={z}&x={x}&y={y}',
    {
      bounds: AFRICA_FIRE_BOUNDS,
      keepBuffer: 6,
      minNativeZoom: 2,
      maxNativeZoom: 12,
      maxZoom: 19,
      noWrap: true,
      opacity: 0.92,
      updateWhenIdle: true,
      updateWhenZooming: false,
      attribution: 'African fire detections Copernicus EFFIS'
    }
  )
  const europeFireTiles = L.tileLayer(
    '/api/effis-fire-tile?z={z}&x={x}&y={y}',
    {
      bounds: EUROPE_FIRE_BOUNDS,
      keepBuffer: 6,
      minNativeZoom: 2,
      maxNativeZoom: 12,
      maxZoom: 19,
      noWrap: true,
      opacity: 0.92,
      updateWhenIdle: true,
      updateWhenZooming: false,
      attribution: 'European fire detections Copernicus EFFIS'
    }
  )
  const volcanoLayer = volcanoActivity.getLeafletLayer()
  const reportedFireLayer = reportedFires.getLeafletLayer()
  const mapOverlayLayers: Record<MapOverlayId, L.Layer> = {
    'volcano-activity': volcanoLayer,
    'heat-detections': fireTiles,
    'reported-wildfires': reportedFireLayer,
    'africa-detections': africaFireTiles,
    'europe-detections': europeFireTiles
  }

  addBaseMap(map)

  const layerControl = L.control.layers(
    {},
    {
      'Worldwide weekly volcano activity': volcanoLayer,
      'Worldwide heat detections · 24h': fireTiles,
      'Africa fire detections · Today + yesterday': africaFireTiles,
      'Europe fire detections · Today + yesterday': europeFireTiles,
      'Reported open wildfires': reportedFireLayer
    },
    {
      collapsed: true,
      position: 'topright'
    }
  ).addTo(map)
  const radar = new WeatherRadarLayer(map)
  const badgeLayer = L.layerGroup().addTo(map)
  const fireStatusController = new AbortController()
  let firmsConfigured: boolean | null = null
  let firmsLoadedTiles = 0
  let africaLoadedTiles = 0
  let europeLoadedTiles = 0

  const getOverlayId = (layer: L.Layer): MapOverlayId | null => {
    if (layer === volcanoLayer) {
      return 'volcano-activity'
    }

    if (layer === fireTiles) {
      return 'heat-detections'
    }

    if (layer === reportedFireLayer) {
      return 'reported-wildfires'
    }

    if (layer === africaFireTiles) {
      return 'africa-detections'
    }

    return layer === europeFireTiles ? 'europe-detections' : null
  }
  const handleOverlayAdd = (event: L.LayersControlEvent) => {
    const layerId = getOverlayId(event.layer)

    if (layerId === 'heat-detections') {
      updateFireLayerStatus(layerId, {
        enabled: true,
        state: firmsConfigured === false ? 'missing-key' : 'loading'
      })
    } else if (layerId && layerId !== 'volcano-activity') {
      updateFireLayerStatus(layerId, { enabled: true, state: 'loading' })
    }

    if (layerId) {
      saveEnabledMapOverlays(map, mapOverlayLayers)
    }
  }
  const handleOverlayRemove = (event: L.LayersControlEvent) => {
    const layerId = getOverlayId(event.layer)

    if (layerId && layerId !== 'volcano-activity') {
      updateFireLayerStatus(layerId, { enabled: false, state: 'idle' })
    }

    if (layerId) {
      saveEnabledMapOverlays(map, mapOverlayLayers)
    }
  }
  const handleFirmsLoading = () => {
    firmsLoadedTiles = 0

    if (map.hasLayer(fireTiles)) {
      updateFireLayerStatus('heat-detections', {
        state: firmsConfigured === false ? 'missing-key' : 'loading'
      })
    }
  }
  const handleFirmsTileLoad = () => {
    firmsLoadedTiles += 1
  }
  const handleFirmsLoad = () => {
    if (!map.hasLayer(fireTiles)) {
      return
    }

    updateFireLayerStatus('heat-detections', {
      state: firmsConfigured === false
        ? 'missing-key'
        : firmsLoadedTiles > 0 ? 'available' : 'unavailable',
      ...(firmsLoadedTiles > 0 ? { lastUpdated: Date.now() } : {})
    })
  }
  const handleAfricaLoading = () => {
    africaLoadedTiles = 0

    if (map.hasLayer(africaFireTiles)) {
      updateFireLayerStatus('africa-detections', { state: 'loading' })
    }
  }
  const handleAfricaTileLoadStart = (event: L.TileEvent) => {
    clipTileToBounds(event.tile, event.coords, AFRICA_FIRE_BOUNDS)
  }
  const handleAfricaTileLoad = (event: L.TileEvent) => {
    if (maskTileToBounds(event.tile, event.coords, AFRICA_FIRE_BOUNDS)) {
      return
    }

    africaLoadedTiles += 1
  }
  const handleAfricaLoad = () => {
    if (map.hasLayer(africaFireTiles)) {
      updateFireLayerStatus('africa-detections', {
        state: africaLoadedTiles > 0 ? 'available' : 'unavailable',
        ...(africaLoadedTiles > 0 ? { lastUpdated: Date.now() } : {})
      })
    }
  }
  const handleEuropeLoading = () => {
    europeLoadedTiles = 0

    if (map.hasLayer(europeFireTiles)) {
      updateFireLayerStatus('europe-detections', { state: 'loading' })
    }
  }
  const handleEuropeTileLoadStart = (event: L.TileEvent) => {
    clipTileToBounds(event.tile, event.coords, EUROPE_FIRE_BOUNDS)
  }
  const handleEuropeTileLoad = (event: L.TileEvent) => {
    if (maskTileToBounds(event.tile, event.coords, EUROPE_FIRE_BOUNDS)) {
      return
    }

    europeLoadedTiles += 1
  }
  const handleEuropeLoad = () => {
    if (map.hasLayer(europeFireTiles)) {
      updateFireLayerStatus('europe-detections', {
        state: europeLoadedTiles > 0 ? 'available' : 'unavailable',
        ...(europeLoadedTiles > 0 ? { lastUpdated: Date.now() } : {})
      })
    }
  }

  map.on('overlayadd', handleOverlayAdd)
  map.on('overlayremove', handleOverlayRemove)
  fireTiles.on('loading', handleFirmsLoading)
  fireTiles.on('tileload', handleFirmsTileLoad)
  fireTiles.on('load', handleFirmsLoad)
  africaFireTiles.on('loading', handleAfricaLoading)
  africaFireTiles.on('tileloadstart', handleAfricaTileLoadStart)
  africaFireTiles.on('tileload', handleAfricaTileLoad)
  africaFireTiles.on('load', handleAfricaLoad)
  europeFireTiles.on('loading', handleEuropeLoading)
  europeFireTiles.on('tileloadstart', handleEuropeTileLoadStart)
  europeFireTiles.on('tileload', handleEuropeTileLoad)
  europeFireTiles.on('load', handleEuropeLoad)

  void fetchWithTimeout(
    '/api/fire-layer-status',
    { signal: fireStatusController.signal },
    5000
  ).then(async response => {
    if (!response.ok) {
      throw new Error('Fire layer status unavailable')
    }

    const payload = await parseResponseJson(
      response,
      fireLayerStatusResponseSchema,
      'Fire layer status response'
    )

    firmsConfigured = payload.firmsConfigured === true

    if (!firmsConfigured && map.hasLayer(fireTiles)) {
      updateFireLayerStatus('heat-detections', { state: 'missing-key' })
    }
  }).catch(() => {
    if (!fireStatusController.signal.aborted && map.hasLayer(fireTiles)) {
      updateFireLayerStatus('heat-detections', { state: 'unavailable' })
    }
  })

  radar.start()
  reportedFires.start()
  volcanoActivity.start()

  for (const layerId of loadEnabledMapOverlays()) {
    mapOverlayLayers[layerId].addTo(map)
  }

  const layerInfoCleanups = decorateLayerControl(layerControl)

  return {
    badgeLayer,
    controlContainer: layerControl.getContainer() ?? null,
    findFireAtPoint: point => findFireTileAtPoint(map, point, [
      {
        layer: africaFireTiles,
        info: AFRICA_EFFIS_HOVER_INFO,
        bounds: AFRICA_FIRE_BOUNDS
      },
      {
        layer: europeFireTiles,
        info: EUROPE_EFFIS_HOVER_INFO,
        bounds: EUROPE_FIRE_BOUNDS
      },
      { layer: fireTiles, info: FIRMS_HOVER_INFO }
    ]),
    setWeatherMode: (mode, radarOpacity) => {
      radar.setMode(mode)
      radar.setOpacity(radarOpacity)
    },
    destroy: () => {
      fireStatusController.abort()
      map.off('overlayadd', handleOverlayAdd)
      map.off('overlayremove', handleOverlayRemove)
      fireTiles.off('loading', handleFirmsLoading)
      fireTiles.off('tileload', handleFirmsTileLoad)
      fireTiles.off('load', handleFirmsLoad)
      africaFireTiles.off('loading', handleAfricaLoading)
      africaFireTiles.off('tileloadstart', handleAfricaTileLoadStart)
      africaFireTiles.off('tileload', handleAfricaTileLoad)
      africaFireTiles.off('load', handleAfricaLoad)
      europeFireTiles.off('loading', handleEuropeLoading)
      europeFireTiles.off('tileloadstart', handleEuropeTileLoadStart)
      europeFireTiles.off('tileload', handleEuropeTileLoad)
      europeFireTiles.off('load', handleEuropeLoad)

      for (const cleanupLayerInfo of layerInfoCleanups) {
        cleanupLayerInfo()
      }

      radar.destroy()
      reportedFires.destroy()
      volcanoActivity.destroy()
      layerControl.remove()
    }
  }
}

function decorateLayerControl(layerControl: L.Control.Layers) {
  const overlayInputs = Array.from(
    layerControl.getContainer()?.querySelectorAll<HTMLInputElement>(
      'input.leaflet-control-layers-selector[type="checkbox"]'
    ) ?? []
  )
  const volcanoLayerInput = overlayInputs[0]
  const heatLayerInput = overlayInputs[1]
  const africaFireInput = overlayInputs[2]
  const europeFireInput = overlayInputs[3]
  const reportedFireInput = overlayInputs[4]

  addLayerControlHeading(volcanoLayerInput, 'Volcanoes')
  addLayerControlHeading(heatLayerInput, 'Satellite detections')
  addLayerControlHeading(reportedFireInput, 'Reported incidents')

  volcanoLayerInput?.setAttribute(
    'aria-label',
    'Worldwide weekly volcano activity from Smithsonian GVP and USGS. Reports are preliminary and not comprehensive.'
  )
  heatLayerInput?.setAttribute(
    'aria-label',
    `Worldwide heat detections from the last 24 hours. ${FIRE_LAYER_DESCRIPTION}`
  )
  reportedFireInput?.setAttribute(
    'aria-label',
    'Reported open wildfires from NIFC, CWFIS, and NASA EONET. Coverage is incomplete and status can lag.'
  )
  africaFireInput?.setAttribute(
    'aria-label',
    'Copernicus Africa fire detections from today and yesterday. These are not confirmed incident reports.'
  )
  europeFireInput?.setAttribute(
    'aria-label',
    'Copernicus Europe fire detections from today and yesterday. These are not confirmed incident reports.'
  )

  return [
    addLayerControlInfo(volcanoLayerInput, {
      id: 'volcanoes',
      label: 'worldwide weekly volcano activity',
      detail: 'Preliminary worldwide activity reported this week by the Smithsonian Global Volcanism Program and USGS.'
    }),
    addLayerControlInfo(heatLayerInput, {
      id: 'worldwide-heat',
      label: 'worldwide heat detections',
      detail: FIRE_LAYER_DESCRIPTION
    }),
    addLayerControlInfo(africaFireInput, {
      id: 'africa-fire',
      label: 'Africa fire detections',
      detail: 'Copernicus EFFIS filtered VIIRS detections from today and yesterday across Africa. These are not confirmed incident reports.'
    }),
    addLayerControlInfo(europeFireInput, {
      id: 'europe-fire',
      label: 'Europe fire detections',
      detail: 'Copernicus EFFIS filtered VIIRS detections from today and yesterday across Europe. These are not confirmed incident reports.'
    }),
    addLayerControlInfo(reportedFireInput, {
      id: 'reported-fires',
      label: 'reported open wildfires',
      detail: 'Open wildfire incidents from NIFC in the USA, CWFIS in Canada, and NASA EONET elsewhere. Coverage is incomplete and status can lag.'
    })
  ]
}

function addLayerControlHeading(
  input: HTMLInputElement | undefined,
  text: string
) {
  const label = input?.closest('label')

  if (!label) {
    return
  }

  const heading = document.createElement('div')

  heading.className = 'leaflet-control-layers-section-title'
  heading.setAttribute('role', 'heading')
  heading.setAttribute('aria-level', '3')
  heading.textContent = text
  label.before(heading)
}
