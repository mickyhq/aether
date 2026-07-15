import { fetchWithTimeout } from '../shared/fetchTimeout.js'

const WEEKLY_VOLCANO_FEED = 'https://volcano.si.edu/news/WeeklyVolcanoRSS.xml'
const REPORT_URL = 'https://volcano.si.edu/reports_weekly.cfm'
const PROVIDER_TIMEOUT_MS = 12000

export async function getWeeklyVolcanoActivity(hooks = {}) {
  hooks.onProviderRequest?.('Smithsonian GVP / USGS')

  const response = await fetchWithTimeout(
    WEEKLY_VOLCANO_FEED,
    {
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml',
        'User-Agent': 'Aether Weather Map'
      }
    },
    PROVIDER_TIMEOUT_MS
  )

  hooks.onProviderResponse?.('Smithsonian GVP / USGS', {
    status: response.status,
    rateLimitLimit: readRateLimitHeader(response.headers, 'limit'),
    rateLimitRemaining: readRateLimitHeader(response.headers, 'remaining'),
    retryAfter: response.headers.get('retry-after')
  })

  if (!response.ok) {
    throw Object.assign(
      new Error(`Smithsonian volcano feed returned ${response.status}`),
      { status: response.status }
    )
  }

  const bytes = await response.arrayBuffer()
  const xml = new TextDecoder('windows-1252').decode(bytes)
  const volcanoes = parseWeeklyVolcanoFeed(xml)

  if (volcanoes.length === 0) {
    throw new Error('Smithsonian volcano feed contained no valid reports')
  }

  return {
    volcanoes,
    reportPublishedAt: readDate(readChannelTag(xml, 'pubDate')),
    source: 'Smithsonian GVP / USGS',
    sourceUrl: REPORT_URL,
    notice: 'Smithsonian GVP / USGS · Preliminary weekly report; not every eruption is included.'
  }
}

export function parseWeeklyVolcanoFeed(xml) {
  return Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi))
    .map(match => parseReport(match[1]))
    .filter(Boolean)
}

function parseReport(item) {
  const title = decodeXml(readTag(item, 'title'))
  const titleParts = title.match(
    /^(.*?) \((.*?)\) - Report for (.*?) - (.*?)$/
  )
  const point = readTag(item, 'georss:point')
    .trim()
    .split(/\s+/)
    .map(Number)
  const guid = decodeXml(readTag(item, 'guid'))
  const volcanoNumber = guid.match(/#vn_(\d+)/)?.[1]

  if (
    !titleParts ||
    point.length !== 2 ||
    !point.every(Number.isFinite) ||
    !volcanoNumber
  ) {
    return null
  }

  const activity = normalizeActivity(titleParts[4])

  return {
    id: `gvp:${volcanoNumber}`,
    volcanoNumber,
    name: titleParts[1].trim(),
    country: titleParts[2].trim(),
    reportPeriod: titleParts[3].trim(),
    activity,
    activityLabel: titleParts[4].trim(),
    latitude: point[0],
    longitude: point[1],
    summary: cleanDescription(readTag(item, 'description')),
    publishedAt: readDate(readTag(item, 'pubDate')),
    reportUrl: `${REPORT_URL}#vn_${volcanoNumber}`,
    profileUrl: `https://volcano.si.edu/volcano.cfm?vn=${volcanoNumber}`
  }
}

function normalizeActivity(label) {
  const value = label.toLowerCase()

  if (value.includes('new') && value.includes('erupt')) {
    return 'new-eruption'
  }

  if (value.includes('erupt')) {
    return 'eruption'
  }

  if (value.includes('new') && value.includes('unrest')) {
    return 'new-unrest'
  }

  if (value.includes('unrest')) {
    return 'unrest'
  }

  return 'other'
}

function cleanDescription(value) {
  return decodeXml(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2400)
}

function readTag(xml, tag) {
  const escapedTag = tag.replace(':', '\\:')
  const match = xml.match(
    new RegExp(`<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`, 'i')
  )

  return match?.[1]?.trim() ?? ''
}

function readChannelTag(xml, tag) {
  const channel = xml.match(/<channel>([\s\S]*?)<item>/i)?.[1] ?? ''

  return readTag(channel, tag)
}

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => {
      const value = code[0].toLowerCase() === 'x'
        ? Number.parseInt(code.slice(1), 16)
        : Number.parseInt(code, 10)

      return Number.isFinite(value) ? String.fromCodePoint(value) : ''
    })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function readDate(value) {
  const timestamp = Date.parse(decodeXml(value))

  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function readRateLimitHeader(headers, name) {
  return headers.get(`ratelimit-${name}`) ??
    headers.get(`x-ratelimit-${name}`)
}
