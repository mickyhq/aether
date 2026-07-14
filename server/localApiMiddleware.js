import airQualityHandler from '../api/air-quality.js'
import clientErrorHandler from '../api/client-error.js'
import ecmwfHandler from '../api/ecmwf.js'
import effisFireTileHandler from '../api/effis-fire-tile.js'
import fireLayerStatusHandler from '../api/fire-layer-status.js'
import fireTileHandler from '../api/fire-tile.js'
import geocodeHandler from '../api/geocode.js'
import heatAlertsHandler from '../api/heat-alerts.js'
import oceanCurrentsHandler from '../api/ocean-currents.js'
import radarHandler from '../api/radar.js'
import reportedFiresHandler from '../api/reported-fires.js'
import weatherHandler from '../api/weather.js'

const MAX_BODY_BYTES = 64 * 1024
const handlers = new Map([
  ['/api/air-quality', airQualityHandler],
  ['/api/client-error', clientErrorHandler],
  ['/api/ecmwf', ecmwfHandler],
  ['/api/effis-fire-tile', effisFireTileHandler],
  ['/api/fire-layer-status', fireLayerStatusHandler],
  ['/api/fire-tile', fireTileHandler],
  ['/api/geocode', geocodeHandler],
  ['/api/heat-alerts', heatAlertsHandler],
  ['/api/ocean-currents', oceanCurrentsHandler],
  ['/api/radar', radarHandler],
  ['/api/reported-fires', reportedFiresHandler],
  ['/api/weather', weatherHandler]
])

export function createLocalApiMiddleware() {
  return async function localApiMiddleware(request, response, next) {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost')
    const handler = handlers.get(requestUrl.pathname)

    if (!handler) {
      next()
      return
    }

    try {
      const apiRequest = Object.assign(request, {
        body: await readBody(request),
        query: readQuery(requestUrl.searchParams)
      })
      const apiResponse = adaptResponse(response)

      await handler(apiRequest, apiResponse)
    } catch (error) {
      next(error)
    }
  }
}

function adaptResponse(response) {
  const apiResponse = Object.assign(response, {
    status(code) {
      response.statusCode = code
      return apiResponse
    },
    json(body) {
      if (!response.hasHeader('Content-Type')) {
        response.setHeader('Content-Type', 'application/json')
      }

      response.end(JSON.stringify(body))
      return apiResponse
    },
    send(body) {
      response.end(body)
      return apiResponse
    }
  })

  return apiResponse
}

async function readBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return undefined
  }

  const chunks = []
  let size = 0

  for await (const chunk of request) {
    size += chunk.length

    if (size > MAX_BODY_BYTES) {
      throw new Error('API request body is too large')
    }

    chunks.push(chunk)
  }

  if (chunks.length === 0) {
    return undefined
  }

  const body = Buffer.concat(chunks).toString('utf8')

  if (request.headers['content-type']?.includes('application/json')) {
    return JSON.parse(body)
  }

  return body
}

function readQuery(searchParams) {
  const query = {}

  for (const [key, value] of searchParams) {
    const current = query[key]

    if (current === undefined) {
      query[key] = value
    } else if (Array.isArray(current)) {
      current.push(value)
    } else {
      query[key] = [current, value]
    }
  }

  return query
}
