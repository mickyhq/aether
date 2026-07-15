import { fetchCoalesced } from './coalescedFetch.js'
import {
  getSharedCache,
  readSharedCache,
  writeSharedCache
} from './sharedCache.js'
import { sendProviderRecord } from './providerResponse.js'
import { getCacheNamespace } from '../shared/cacheVersion.js'

const ASTRO_ENDPOINT = 'https://www.7timer.info/bin/api.pl'
const LIGHT_ENDPOINT = 'https://arcgis.wara.es/arcgis/rest/services/RB/Dinamicos/MapServer/identify'
const FRESH_TTL = 3 * 60 * 60
const STALE_TTL = 12 * 60 * 60
const CLOUD_PERCENT = [3, 12, 25, 38, 50, 62, 75, 87, 97]
const SEEING_ARCSECONDS = [0.4, 0.625, 0.875, 1.125, 1.375, 1.75, 2.25, 3]
const TRANSPARENCY = [0.25, 0.35, 0.45, 0.55, 0.65, 0.775, 0.925, 1.1]
const BORTLE_VALUES = [1, 2, 3, 4, 5, 6.5, 8.5]
const BORTLE_LABELS = ['1', '2', '3', '4', '5', '6–7', '8–9']

export async function handleStargazing(request, response) {
  const latitude = readCoordinate(request.query.latitude, -90, 90)
  const longitude = readCoordinate(request.query.longitude, -180, 180)

  if (latitude === null || longitude === null) {
    response.status(400).json({ error: 'Valid latitude and longitude required' })
    return
  }

  const cacheKey = `${latitude.toFixed(3)}:${longitude.toFixed(3)}`
  const cache = getSharedCache(getCacheNamespace('stargazing'))
  const fresh = await readSharedCache(cache, `fresh:${cacheKey}`)

  if (fresh) {
    sendStargazing(response, fresh, 'runtime')
    return
  }

  const stale = await readSharedCache(cache, `stale:${cacheKey}`)

  try {
    const [astro, light] = await Promise.all([
      fetchAstro(latitude, longitude),
      fetchLightPollution(latitude, longitude).catch(() => null)
    ])
    const payload = buildStargazingForecast(astro, light, latitude, longitude)

    if (!payload) throw new Error('Invalid astronomy forecast')

    const record = {
      body: JSON.stringify(payload),
      contentType: 'application/json'
    }

    await Promise.all([
      writeSharedCache(cache, `fresh:${cacheKey}`, record, FRESH_TTL),
      writeSharedCache(cache, `stale:${cacheKey}`, record, STALE_TTL)
    ])
    sendStargazing(response, record, 'upstream')
  } catch {
    if (stale) {
      sendStargazing(response, stale, 'stale')
      return
    }

    response.status(502).json({ error: 'Stargazing forecast unavailable' })
  }
}

async function fetchAstro(latitude, longitude) {
  const url = new URL(ASTRO_ENDPOINT)

  url.searchParams.set('lat', latitude.toFixed(3))
  url.searchParams.set('lon', longitude.toFixed(3))
  url.searchParams.set('product', 'astro')
  url.searchParams.set('output', 'json')

  const upstream = await fetchCoalesced(
    `stargazing-astro:${latitude.toFixed(3)}:${longitude.toFixed(3)}`,
    url.toString(),
    'Aether Weather Map',
    {},
    'stargazing'
  )

  if (!upstream.ok) throw new Error('Astronomy provider unavailable')
  return JSON.parse(upstream.body)
}

async function fetchLightPollution(latitude, longitude) {
  const url = new URL(LIGHT_ENDPOINT)
  const extent = [longitude - 0.1, latitude - 0.1, longitude + 0.1, latitude + 0.1]

  url.searchParams.set('f', 'json')
  url.searchParams.set('geometry', JSON.stringify({
    x: longitude,
    y: latitude,
    spatialReference: { wkid: 4326 }
  }))
  url.searchParams.set('geometryType', 'esriGeometryPoint')
  url.searchParams.set('sr', '4326')
  url.searchParams.set('layers', 'all:8')
  url.searchParams.set('tolerance', '2')
  url.searchParams.set('mapExtent', extent.join(','))
  url.searchParams.set('imageDisplay', '400,400,96')
  url.searchParams.set('returnGeometry', 'false')

  const upstream = await fetchCoalesced(
    `stargazing-light:${latitude.toFixed(3)}:${longitude.toFixed(3)}`,
    url.toString(),
    'Aether Weather Map',
    {},
    'stargazing-light'
  )

  if (!upstream.ok) throw new Error('Light pollution provider unavailable')

  const payload = JSON.parse(upstream.body)
  const attributes = payload?.results?.find(result => result.layerId === 8)?.attributes
  const pixelEntry = attributes && Object.entries(attributes).find(([key]) => (
    /p.xel|pixel/i.test(key)
  ))
  const classCode = Number(pixelEntry?.[1])

  if (!Number.isInteger(classCode) || classCode < 1 || classCode > 7) return null

  return {
    classCode,
    bortle: BORTLE_VALUES[classCode - 1],
    label: BORTLE_LABELS[classCode - 1]
  }
}

function buildStargazingForecast(astro, light, latitude, longitude) {
  if (astro?.product !== 'astro' || !Array.isArray(astro.dataseries)) return null

  const initializedAt = parseInitialization(astro.init)

  if (!initializedAt) return null

  const groups = new Map()

  for (const item of astro.dataseries) {
    if (!isAstroSlot(item)) continue

    const time = new Date(initializedAt.getTime() + item.timepoint * 60 * 60 * 1000)

    if (getSunAltitude(time, latitude, longitude) > -12) continue

    const key = getNightKey(time, longitude)
    const slots = groups.get(key) ?? []

    slots.push(buildSlot(item, time, light))
    groups.set(key, slots)
  }

  const nights = [...groups.entries()]
    .map(([date, slots]) => {
      const best = slots.sort((first, second) => second.score - first.score)[0]

      return {
        date,
        ...best
      }
    })
    .slice(0, 3)

  return {
    initializedAt: initializedAt.toISOString(),
    lightPollution: light
      ? { estimatedBortle: light.label, classCode: light.classCode }
      : null,
    nights
  }
}

function buildSlot(item, time, light) {
  const cloudCover = CLOUD_PERCENT[item.cloudcover - 1]
  const seeing = SEEING_ARCSECONDS[item.seeing - 1]
  const transparency = TRANSPARENCY[item.transparency - 1]
  const moon = getMoonPhase(time)
  const factors = [
    { score: 100 - cloudCover, weight: 0.42 },
    { score: (9 - item.transparency) / 8 * 100, weight: 0.18 },
    { score: (9 - item.seeing) / 8 * 100, weight: 0.18 },
    { score: 100 - moon.illumination, weight: 0.08 }
  ]

  if (light) {
    factors.push({
      score: (10 - light.bortle) / 9 * 100,
      weight: 0.14
    })
  }

  const weight = factors.reduce((total, factor) => total + factor.weight, 0)
  const score = Math.round(
    factors.reduce((total, factor) => total + factor.score * factor.weight, 0) / weight
  )

  return {
    score,
    rating: getRating(score),
    bestTime: time.toISOString(),
    cloudCover,
    seeingArcseconds: seeing,
    transparency,
    moonIllumination: moon.illumination,
    moonPhase: moon.name
  }
}

function getMoonPhase(time) {
  const newMoon = Date.UTC(2000, 0, 6, 18, 14)
  const synodicMonth = 29.53058867 * 86400000
  const phase = ((time.getTime() - newMoon) % synodicMonth + synodicMonth) % synodicMonth /
    synodicMonth
  const illumination = Math.round((1 - Math.cos(phase * Math.PI * 2)) / 2 * 100)

  if (phase < 0.03 || phase >= 0.97) return { illumination, name: 'New moon' }
  if (phase < 0.22) return { illumination, name: 'Waxing crescent' }
  if (phase < 0.28) return { illumination, name: 'First quarter' }
  if (phase < 0.47) return { illumination, name: 'Waxing gibbous' }
  if (phase < 0.53) return { illumination, name: 'Full moon' }
  if (phase < 0.72) return { illumination, name: 'Waning gibbous' }
  if (phase < 0.78) return { illumination, name: 'Last quarter' }
  return { illumination, name: 'Waning crescent' }
}

function getSunAltitude(time, latitude, longitude) {
  const start = Date.UTC(time.getUTCFullYear(), 0, 0)
  const day = Math.floor((time.getTime() - start) / 86400000)
  const declination = 23.44 * Math.PI / 180 *
    Math.sin(2 * Math.PI * (284 + day) / 365)
  const solarHour = time.getUTCHours() + time.getUTCMinutes() / 60 + longitude / 15
  const hourAngle = (solarHour - 12) * 15 * Math.PI / 180
  const lat = latitude * Math.PI / 180
  const altitude = Math.asin(
    Math.sin(lat) * Math.sin(declination) +
    Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle)
  )

  return altitude * 180 / Math.PI
}

function getNightKey(time, longitude) {
  const local = new Date(time.getTime() + longitude / 15 * 60 * 60 * 1000)

  if (local.getUTCHours() < 12) local.setUTCDate(local.getUTCDate() - 1)
  return local.toISOString().slice(0, 10)
}

function parseInitialization(value) {
  if (!/^\d{10}$/.test(value)) return null

  return new Date(Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(4, 6)) - 1,
    Number(value.slice(6, 8)),
    Number(value.slice(8, 10))
  ))
}

function isAstroSlot(item) {
  return (
    Number.isFinite(item?.timepoint) &&
    Number.isInteger(item?.cloudcover) && item.cloudcover >= 1 && item.cloudcover <= 9 &&
    Number.isInteger(item?.seeing) && item.seeing >= 1 && item.seeing <= 8 &&
    Number.isInteger(item?.transparency) && item.transparency >= 1 && item.transparency <= 8
  )
}

function getRating(score) {
  if (score >= 80) return 'Excellent'
  if (score >= 65) return 'Good'
  if (score >= 45) return 'Fair'
  if (score >= 25) return 'Poor'
  return 'Bad'
}

function readCoordinate(value, minimum, maximum) {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number(raw)

  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null
}

function sendStargazing(response, record, cacheStatus) {
  sendProviderRecord(response, record, cacheStatus, {
    route: 'stargazing',
    maxAge: FRESH_TTL,
    sharedMaxAge: FRESH_TTL
  })
}
