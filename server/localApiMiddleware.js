import { getApiHandler } from './apiRoutes.js'

const MAX_BODY_BYTES = 64 * 1024

export function createLocalApiMiddleware() {
  return async function localApiMiddleware(request, response, next) {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost')
    const handler = getApiHandler(requestUrl.pathname)

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
