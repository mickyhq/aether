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
import { SeismicActivityLayer } from './SeismicActivityLayer'
import {
  clipTileToBounds,
  maskTileToBounds
} from './regionalTileClip'
import { VolcanoActivityLayer } from './VolcanoActivityLayer'
import { WeatherRadarLayer } from './WeatherRadarLayer'
import type { TranslationKey } from '../i18n/translations'

const AFRICA_FIRE_BOUNDS = L.latLngBounds([-35, -20], [40, 55])
const EUROPE_FIRE_BOUNDS = L.latLngBounds([40, -25], [72, 45])
type AetherMapLayersOptions = {
  map: L.Map
  mapLanguage: string
  t: (key: TranslationKey, values?: Record<string, string | number>) => string
  updateFireLayerStatus: (
    id: FireLayerId,
    patch: FireLayerStatusPatch
  ) => void
}

export type AetherMapLayers = {
  badgeLayer: L.LayerGroup
  destroy: () => void
  findFireAtPoint: (point: L.Point) => MapFirePointer | null
  setMapLanguage: (language: string) => void
  setWeatherMode: (mode: WeatherMode, radarOpacity: number) => void
}

export function createAetherMapLayers({
  map,
  mapLanguage,
  t,
  updateFireLayerStatus
}: AetherMapLayersOptions): AetherMapLayers {
  const firmsPointerInfo: MapFirePointer = {
    title: t('layers.worldwideDetection'),
    source: 'NASA FIRMS · VIIRS',
    detail: t('layers.lastDayDetail')
  }
  const africaEffisPointerInfo: MapFirePointer = {
    title: t('layers.africaDetection'),
    source: 'Copernicus EFFIS · VIIRS',
    detail: t('layers.twoDayDetail')
  }
  const europeEffisPointerInfo: MapFirePointer = {
    title: t('layers.europeDetection'),
    source: 'Copernicus EFFIS · VIIRS',
    detail: t('layers.twoDayDetail')
  }
  const reportedFires = new ReportedFireLayer(
    map,
    status => updateFireLayerStatus('reported-wildfires', status),
    t
  )
  const volcanoActivity = new VolcanoActivityLayer(map, t)
  const seismicActivity = new SeismicActivityLayer(map, t)
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
  const seismicLayer = seismicActivity.getLeafletLayer()
  const reportedFireLayer = reportedFires.getLeafletLayer()
  const mapOverlayLayers: Record<MapOverlayId, L.Layer> = {
    'volcano-activity': volcanoLayer,
    'seismic-activity': seismicLayer,
    'heat-detections': fireTiles,
    'reported-wildfires': reportedFireLayer,
    'africa-detections': africaFireTiles,
    'europe-detections': europeFireTiles
  }

  const baseMap = addBaseMap(map, mapLanguage)

  const layerControl = L.control.layers(
    {},
    {
      [t('layers.volcanoName')]: volcanoLayer,
      [t('layers.seismicName')]: seismicLayer,
      [t('layers.heatName')]: fireTiles,
      [t('layers.africaName')]: africaFireTiles,
      [t('layers.europeName')]: europeFireTiles,
      [t('layers.reportedName')]: reportedFireLayer
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

    if (layer === seismicLayer) {
      return 'seismic-activity'
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
    } else if (layerId && isFireOverlayId(layerId)) {
      updateFireLayerStatus(layerId, { enabled: true, state: 'loading' })
    }

    if (layerId) {
      saveEnabledMapOverlays(map, mapOverlayLayers)
    }
  }
  const handleOverlayRemove = (event: L.LayersControlEvent) => {
    const layerId = getOverlayId(event.layer)

    if (layerId && isFireOverlayId(layerId)) {
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
  seismicActivity.start()

  for (const layerId of loadEnabledMapOverlays()) {
    mapOverlayLayers[layerId].addTo(map)
  }

  const layerInfoCleanups = decorateLayerControl(layerControl, t)

  return {
    badgeLayer,
    findFireAtPoint: point => findFireTileAtPoint(map, point, [
      {
        layer: africaFireTiles,
        info: africaEffisPointerInfo,
        bounds: AFRICA_FIRE_BOUNDS
      },
      {
        layer: europeFireTiles,
        info: europeEffisPointerInfo,
        bounds: EUROPE_FIRE_BOUNDS
      },
      { layer: fireTiles, info: firmsPointerInfo }
    ]),
    setMapLanguage: baseMap.setLanguage,
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
      seismicActivity.destroy()
      layerControl.remove()
    }
  }
}

function decorateLayerControl(
  layerControl: L.Control.Layers,
  t: AetherMapLayersOptions['t']
) {
  const overlayInputs = Array.from(
    layerControl.getContainer()?.querySelectorAll<HTMLInputElement>(
      'input.leaflet-control-layers-selector[type="checkbox"]'
    ) ?? []
  )
  const volcanoLayerInput = overlayInputs[0]
  const seismicLayerInput = overlayInputs[1]
  const heatLayerInput = overlayInputs[2]
  const africaFireInput = overlayInputs[3]
  const europeFireInput = overlayInputs[4]
  const reportedFireInput = overlayInputs[5]

  addLayerControlHeading(volcanoLayerInput, t('layers.geological'))
  addLayerControlHeading(heatLayerInput, t('layers.satellite'))
  addLayerControlHeading(reportedFireInput, t('layers.reported'))

  volcanoLayerInput?.setAttribute(
    'aria-label',
    t('layers.volcanoDetail')
  )
  seismicLayerInput?.setAttribute(
    'aria-label',
    t('layers.seismicDetail')
  )
  heatLayerInput?.setAttribute(
    'aria-label',
    t('layers.heatDetail')
  )
  reportedFireInput?.setAttribute(
    'aria-label',
    t('layers.reportedDetail')
  )
  africaFireInput?.setAttribute(
    'aria-label',
    t('layers.africaDetail')
  )
  europeFireInput?.setAttribute(
    'aria-label',
    t('layers.europeDetail')
  )

  return [
    addLayerControlInfo(volcanoLayerInput, {
      id: 'volcanoes',
      label: t('layers.volcanoName'),
      detail: t('layers.volcanoDetail'),
      aboutLabel: t('layers.about', { layer: t('layers.volcanoName') })
    }),
    addLayerControlInfo(seismicLayerInput, {
      id: 'seismic-activity',
      label: t('layers.seismicShort'),
      detail: t('layers.seismicDetail'),
      aboutLabel: t('layers.about', { layer: t('layers.seismicShort') })
    }),
    addLayerControlInfo(heatLayerInput, {
      id: 'worldwide-heat',
      label: t('layers.heatShort'),
      detail: t('layers.heatDetail'),
      aboutLabel: t('layers.about', { layer: t('layers.heatShort') })
    }),
    addLayerControlInfo(africaFireInput, {
      id: 'africa-fire',
      label: t('layers.africaShort'),
      detail: t('layers.africaDetail'),
      aboutLabel: t('layers.about', { layer: t('layers.africaShort') })
    }),
    addLayerControlInfo(europeFireInput, {
      id: 'europe-fire',
      label: t('layers.europeShort'),
      detail: t('layers.europeDetail'),
      aboutLabel: t('layers.about', { layer: t('layers.europeShort') })
    }),
    addLayerControlInfo(reportedFireInput, {
      id: 'reported-fires',
      label: t('layers.reportedShort'),
      detail: t('layers.reportedDetail'),
      aboutLabel: t('layers.about', { layer: t('layers.reportedShort') })
    })
  ]
}

function isFireOverlayId(layerId: MapOverlayId): layerId is FireLayerId {
  return layerId === 'heat-detections' ||
    layerId === 'reported-wildfires' ||
    layerId === 'africa-detections' ||
    layerId === 'europe-detections'
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
