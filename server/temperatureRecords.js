import { fetchCoalesced } from './coalescedFetch.js'
import {
  getSharedCache,
  readSharedCache,
  writeSharedCache
} from './sharedCache.js'
import { sendProviderRecord } from './providerResponse.js'
import { getCacheNamespace } from '../shared/cacheVersion.js'

const ARCHIVE_ENDPOINT = 'https://archive-api.open-meteo.com/v1/archive'
const START_DATE = '1950-01-01'
const FRESH_TTL = 32 * 24 * 60 * 60
const STALE_TTL = 365 * 24 * 60 * 60

export async function handleTemperatureRecords(request, response) {
  const latitude = readCoordinate(request.query.latitude, -90, 90)
  const longitude = readCoordinate(request.query.longitude, -180, 180)

  if (latitude === null || longitude === null) {
    response.status(400).json({ error: 'Valid latitude and longitude required' })
    return
  }

  const endDate = getLastCompleteMonthDate()
  const locationKey = `${latitude.toFixed(3)}:${longitude.toFixed(3)}`
  const cacheKey = `${locationKey}:${endDate}`
  const cache = getSharedCache(getCacheNamespace('temperature-records'))
  const fresh = await readSharedCache(cache, `fresh:${cacheKey}`)

  if (fresh) {
    sendTemperatureRecords(response, fresh, 'runtime')
    return
  }

  const stale = await readSharedCache(cache, `stale:${locationKey}`)
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    start_date: START_DATE,
    end_date: endDate,
    daily: 'temperature_2m_max,temperature_2m_min',
    models: 'era5_land',
    timezone: 'auto'
  })

  try {
    const upstream = await fetchCoalesced(
      `temperature-records:${cacheKey}`,
      `${ARCHIVE_ENDPOINT}?${params.toString()}`,
      'Aether Weather Map',
      {},
      'temperature-records'
    )

    if (!upstream.ok) {
      if (stale) {
        sendTemperatureRecords(response, stale, 'stale')
        return
      }

      response.status(upstream.status).json({ error: 'Temperature history unavailable' })
      return
    }

    const payload = parseTemperatureRecords(upstream.body)

    if (!payload) {
      if (stale) {
        sendTemperatureRecords(response, stale, 'stale')
        return
      }

      response.status(502).json({ error: 'Invalid temperature history response' })
      return
    }

    const record = {
      body: JSON.stringify(payload),
      contentType: 'application/json'
    }

    await Promise.all([
      writeSharedCache(cache, `fresh:${cacheKey}`, record, FRESH_TTL),
      writeSharedCache(cache, `stale:${locationKey}`, record, STALE_TTL)
    ])
    sendTemperatureRecords(response, record, 'upstream')
  } catch {
    if (stale) {
      sendTemperatureRecords(response, stale, 'stale')
      return
    }

    response.status(502).json({ error: 'Temperature history unavailable' })
  }
}

function parseTemperatureRecords(body) {
  let payload

  try {
    payload = JSON.parse(body)
  } catch {
    return null
  }

  const dates = payload?.daily?.time
  const maximums = payload?.daily?.temperature_2m_max
  const minimums = payload?.daily?.temperature_2m_min

  if (!Array.isArray(dates) || !Array.isArray(maximums) || !Array.isArray(minimums)) {
    return null
  }

  let highest = null
  let lowest = null

  for (let index = 0; index < dates.length; index += 1) {
    const maximum = maximums[index]
    const minimum = minimums[index]

    if (Number.isFinite(maximum) && (!highest || maximum > highest.temperature)) {
      highest = { temperature: maximum, date: dates[index] }
    }

    if (Number.isFinite(minimum) && (!lowest || minimum < lowest.temperature)) {
      lowest = { temperature: minimum, date: dates[index] }
    }
  }

  if (!highest || !lowest) {
    return null
  }

  return {
    highest,
    lowest,
    period: {
      start: dates[0],
      end: dates.at(-1)
    },
    model: 'ERA5-Land',
    resolution: '11 km',
    latitude: payload.latitude,
    longitude: payload.longitude
  }
}

function readCoordinate(value, minimum, maximum) {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number(raw)

  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null
}

function getLastCompleteMonthDate() {
  const now = new Date()

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
    .toISOString()
    .slice(0, 10)
}

function sendTemperatureRecords(response, record, cacheStatus) {
  sendProviderRecord(response, record, cacheStatus, {
    route: 'temperature-records',
    maxAge: 24 * 60 * 60,
    sharedMaxAge: 32 * 24 * 60 * 60
  })
}
