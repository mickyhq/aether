import { fetchWithTimeout } from '../shared/fetchTimeout.js'
import { logFetchDiagnostics } from './providerDiagnostics.js'

const CURRENT_ENDPOINT = 'https://coastwatch.noaa.gov/erddap/griddap/noaacwBLENDEDNRTcurrentsDaily.json'
const TEMPERATURE_ENDPOINT = 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncdcOisst21NrtAgg_LonPM180.json'
const RONI_ENDPOINT = 'https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt'
const USER_AGENT = 'Aether Weather Map ocean-current layer'
const NOAA_TIMEOUT_MS = 15000

export async function fetchOceanCurrentGrid(bounds) {
  const sampling = getSampling(bounds)
  const latitudeRange = range(
    sampling.south,
    sampling.north,
    sampling.stride
  )
  const longitudeRange = range(
    sampling.west,
    sampling.east,
    sampling.stride
  )
  const currentProjection = [
    `u_current[(last)]${latitudeRange}${longitudeRange}`,
    `v_current[(last)]${latitudeRange}${longitudeRange}`
  ].join(',')
  const temperatureProjection = [
    `sst[(last)][(0)]${latitudeRange}${longitudeRange}`,
    `anom[(last)][(0)]${latitudeRange}${longitudeRange}`
  ].join(',')

  const [currentPayload, temperaturePayload, enso] = await Promise.all([
    fetchNoaaGrid(`${CURRENT_ENDPOINT}?${currentProjection}`),
    fetchNoaaGrid(`${TEMPERATURE_ENDPOINT}?${temperatureProjection}`),
    fetchRoni().catch(() => null)
  ])
  const temperatures = indexTemperatureRows(temperaturePayload.table)
  const currentColumns = columnIndexes(currentPayload.table.columnNames)
  const samples = []
  let currentTime = null
  let temperatureTime = null
  let oceanSampleCount = 0

  for (const row of currentPayload.table.rows) {
    const latitude = finiteNumber(row[currentColumns.latitude])
    const longitude = finiteNumber(row[currentColumns.longitude])
    const eastward = finiteNumber(row[currentColumns.u_current])
    const northward = finiteNumber(row[currentColumns.v_current])

    currentTime ??= String(row[currentColumns.time])

    if (
      latitude === null ||
      longitude === null
    ) {
      continue
    }

    const temperature = temperatures.get(coordinateKey(latitude, longitude))

    if (
      eastward === null ||
      northward === null ||
      Math.abs(eastward) > 10 ||
      Math.abs(northward) > 10 ||
      !temperature
    ) {
      samples.push({
        latitude,
        longitude,
        ocean: false,
        eastward: 0,
        northward: 0,
        speed: 0,
        temperature: 0,
        anomaly: 0
      })
      continue
    }

    temperatureTime ??= temperature.time
    oceanSampleCount += 1
    samples.push({
      latitude,
      longitude,
      ocean: true,
      eastward,
      northward,
      speed: Math.hypot(eastward, northward),
      temperature: temperature.value,
      anomaly: temperature.anomaly
    })
  }

  return {
    source: 'NOAA NESDIS CoastWatch',
    currentProduct: 'Daily global geostrophic surface currents',
    temperatureProduct: 'NOAA OISST v2.1',
    enso,
    currentTime,
    temperatureTime,
    stride: sampling.stride,
    oceanSampleCount,
    samples
  }
}

async function fetchRoni() {
  const response = await fetchWithTimeout(RONI_ENDPOINT, {
    headers: {
      Accept: 'text/plain',
      'User-Agent': USER_AGENT
    }
  }, NOAA_TIMEOUT_MS)

  logFetchDiagnostics('ocean-currents-roni', 'noaa', response)

  if (!response.ok) {
    throw new Error(`NOAA RONI service failed with ${response.status}`)
  }

  const records = (await response.text())
    .trim()
    .split('\n')
    .slice(1)
    .map(line => {
      const [season, year, anomaly] = line.trim().split(/\s+/)

      return {
        season,
        year: Number(year),
        anomaly: Number(anomaly)
      }
    })
    .filter(record => (
      record.season &&
      Number.isFinite(record.year) &&
      Number.isFinite(record.anomaly)
    ))
  const latest = records.at(-1)

  if (!latest) {
    throw new Error('NOAA RONI service returned no records')
  }

  const latestFive = records.slice(-5)
  const phase = latestFive.length === 5 && latestFive.every(record => record.anomaly >= 0.5)
    ? 'el-nino'
    : latestFive.length === 5 && latestFive.every(record => record.anomaly <= -0.5)
      ? 'la-nina'
      : 'neutral'

  return {
    index: 'RONI',
    phase,
    season: latest.season,
    year: latest.year,
    anomaly: latest.anomaly,
    provisional: true
  }
}

async function fetchNoaaGrid(url) {
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT
    }
  }, NOAA_TIMEOUT_MS)

  logFetchDiagnostics('ocean-currents-grid', 'noaa', response)

  if (!response.ok) {
    throw new Error(`NOAA ocean service failed with ${response.status}`)
  }

  const payload = await response.json()

  if (!payload?.table?.columnNames || !Array.isArray(payload.table.rows)) {
    throw new Error('NOAA ocean service returned an invalid grid')
  }

  return payload
}

function indexTemperatureRows(table) {
  const columns = columnIndexes(table.columnNames)
  const values = new Map()

  for (const row of table.rows) {
    const latitude = finiteNumber(row[columns.latitude])
    const longitude = finiteNumber(row[columns.longitude])
    const value = finiteNumber(row[columns.sst])
    const anomaly = finiteNumber(row[columns.anom])

    if (
      latitude === null ||
      longitude === null ||
      value === null ||
      anomaly === null ||
      value < -3 ||
      value > 45 ||
      anomaly < -15 ||
      anomaly > 15
    ) {
      continue
    }

    values.set(coordinateKey(latitude, longitude), {
      value,
      anomaly,
      time: String(row[columns.time])
    })
  }

  return values
}

function getSampling(bounds) {
  const south = clamp(bounds.south, -85, 85)
  const north = clamp(bounds.north, -85, 85)
  const west = clamp(bounds.west, -179.875, 179.875)
  const east = clamp(bounds.east, -179.875, 179.875)
  const latitudeSpan = Math.max(0.25, north - south)
  const longitudeSpan = Math.max(0.25, east - west)
  const targetColumns = clamp(Math.round(bounds.width / 14), 48, 112)
  const targetRows = clamp(Math.round(bounds.height / 14), 32, 72)
  const stride = clamp(Math.ceil(Math.max(
    latitudeSpan * 4 / targetRows,
    longitudeSpan * 4 / targetColumns
  )), 1, 16)

  return {
    south,
    north,
    west,
    east,
    stride
  }
}

function range(start, end, stride) {
  return `[(${start.toFixed(3)}):${stride}:(${end.toFixed(3)})]`
}

function columnIndexes(names) {
  return Object.fromEntries(names.map((name, index) => [name, index]))
}

function coordinateKey(latitude, longitude) {
  return `${latitude.toFixed(3)}:${longitude.toFixed(3)}`
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const number = Number(value)

  return Number.isFinite(number) ? number : null
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}
