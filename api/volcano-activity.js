import { getWeeklyVolcanoActivity } from '../server/volcanoActivity.js'
import { loadCachedResource } from '../server/cachedResource.js'
import {
  logCacheMetric,
  logProviderFailure,
  logQuotaAlert
} from '../server/cacheMetrics.js'
import { getSharedCache } from '../server/sharedCache.js'
import {
  readProviderQuota,
  setProviderHeaders
} from '../server/providerQuota.js'
import { getCacheNamespace } from '../shared/cacheVersion.js'

const FRESH_CACHE_TTL = 6 * 60 * 60
const STALE_CACHE_TTL = 14 * 24 * 60 * 60
const METRICS_ROUTE = 'volcano-activity'

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const cache = getSharedCache(getCacheNamespace('volcano-activity'))
  let providerFailures = 0
  let quota = null

  try {
    const result = await loadCachedResource({
      cache,
      cacheKey: 'current-week',
      freshTtl: FRESH_CACHE_TTL,
      staleTtl: STALE_CACHE_TTL,
      onFreshMiss: () => logCacheMetric(METRICS_ROUTE, 'miss'),
      load: () => getWeeklyVolcanoActivity({
        onProviderRequest: () => logCacheMetric(METRICS_ROUTE, 'upstream'),
        onProviderResponse: (provider, upstream) => {
          const providerQuota = readProviderQuota(upstream)

          if (providerQuota) {
            quota = providerQuota
            logQuotaAlert(METRICS_ROUTE, provider, providerQuota)
          }
        }
      })
    })

    if (result.source === 'runtime') {
      logCacheMetric(METRICS_ROUTE, 'hit')
    } else if (result.source === 'stale') {
      logCacheMetric(METRICS_ROUTE, 'stale')
    }

    response.status(200)
    response.setHeader('X-Aether-Cache', result.source)
    setProviderHeaders(response, providerFailures, quota)
    response.setHeader('Cache-Control', 'public, max-age=3600')
    response.setHeader(
      'Vercel-CDN-Cache-Control',
      `public, s-maxage=${FRESH_CACHE_TTL}, stale-while-revalidate=86400`
    )
    response.json(result.record)
  } catch (error) {
    providerFailures = 1
    logProviderFailure(METRICS_ROUTE, 'Smithsonian GVP / USGS', error)
    setProviderHeaders(response, providerFailures, quota)
    response.status(502).json({ error: 'Volcano activity feed unavailable' })
  }
}
