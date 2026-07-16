import airQualityHandler from '../routes/air-quality.js'
import clientErrorHandler from '../routes/client-error.js'
import clientTelemetryHandler from '../routes/client-telemetry.js'
import ecmwfHandler from '../routes/ecmwf.js'
import effisFireTileHandler from '../routes/effis-fire-tile.js'
import fireLayerStatusHandler from '../routes/fire-layer-status.js'
import fireTileHandler from '../routes/fire-tile.js'
import geocodeHandler from '../routes/geocode.js'
import heatAlertsHandler from '../routes/heat-alerts.js'
import oceanCurrentsHandler from '../routes/ocean-currents.js'
import radarHandler from '../routes/radar.js'
import reportedFiresHandler from '../routes/reported-fires.js'
import temperatureAnomalyHandler from '../routes/temperature-anomaly.js'
import weatherHandler from '../routes/weather.js'
import volcanoActivityHandler from './volcanoActivityHandler.js'

const ROUTE_QUERY_KEY = '__aether_route'
const handlers = new Map([
  ['/api/air-quality', airQualityHandler],
  ['/api/client-error', clientErrorHandler],
  ['/api/client-telemetry', clientTelemetryHandler],
  ['/api/ecmwf', ecmwfHandler],
  ['/api/effis-fire-tile', effisFireTileHandler],
  ['/api/fire-layer-status', fireLayerStatusHandler],
  ['/api/fire-tile', fireTileHandler],
  ['/api/geocode', geocodeHandler],
  ['/api/heat-alerts', heatAlertsHandler],
  ['/api/ocean-currents', oceanCurrentsHandler],
  ['/api/radar', radarHandler],
  ['/api/reported-fires', reportedFiresHandler],
  ['/api/temperature-anomaly', temperatureAnomalyHandler],
  ['/api/volcano-activity', volcanoActivityHandler],
  ['/api/weather', weatherHandler]
])

export function getApiHandler(pathname) {
  return handlers.get(pathname) ?? null
}

export async function dispatchApiRequest(request, response) {
  const query = { ...request.query }
  const route = first(query[ROUTE_QUERY_KEY])

  delete query[ROUTE_QUERY_KEY]
  request.query = query

  const handler = typeof route === 'string'
    ? getApiHandler(`/api/${route}`)
    : null

  if (!handler) {
    response.setHeader('Cache-Control', 'no-store')
    response.status(404).json({ error: 'API route not found' })
    return
  }

  await handler(request, response)
}

function first(value) {
  return Array.isArray(value) ? value[0] : value
}
