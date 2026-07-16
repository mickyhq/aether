# Monitoring

Vercel logs emit JSON events with `event: "aether.cache"`. Build dashboard sums by `route` for:

- `cacheHitCount`
- `cacheMissCount`
- `staleCount`
- `upstreamRequestCount`

Create alerts for:

- stale responses above 5% for 15 minutes
- provider failures or HTTP 502 responses above 2% for 10 minutes
- HTTP 429 responses above 1% for 10 minutes
- cache hit rate below 50% for 30 minutes
- any `aether.client-render-error` event

Review thresholds after one week of production traffic. Expected traffic and provider behavior should set the final baseline.

Client performance logs use `event: "aether.client-performance"`. They contain
only aggregated animation timings and counters keyed by a fixed provider name:

- animation sample count, average frame time, maximum frame time, and frames at or above 50 ms
- provider failure count
- aborted refresh count

The client does not send coordinates, place names, request URLs, location keys,
session identifiers, or location history with telemetry.

Quota and backoff logs use `event: "aether.provider-diagnostic"` for these
provider groups: weather, air quality, radar, geocoding, NOAA, webcam, and
astronomy. Dashboard dimensions are:

- `provider` and `route`
- `status`, `quotaLevel`, `quotaRemaining`, and `quotaLimit`
- `backoffState` and `retryAfterSeconds`
- `cacheFallback` (`stale`, `none`, or `unknown`)

Weather and air-quality responses also expose `X-Aether-Backoff` and
`X-Aether-Backoff-Seconds` while a shared upstream block starts or remains
active. Diagnostic events never include API keys, request URLs, query values,
coordinates, or cache keys.
