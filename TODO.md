# Aether Improvements

## P0 — Weather reliability

- [x] Validate and canonicalize all API parameters to prevent cache-busting requests.
- [x] Warm the Vercel cache for popular locations after deployment.
- [ ] Prioritize selected-location forecasts over background map-grid refreshes.
- [ ] Show clear `Live`, `Cached`, `Stale`, and `Unavailable` states in the UI.

## P1 — Cache and monitoring

- [ ] Add tests for Runtime Cache hits, stale fallback, provider failure, and expiry.
- [ ] Track cache hit, miss, stale, and upstream request counts in Vercel logs.
- [ ] Add a cache version constant and documented invalidation process.
- [ ] Reduce map sample density when the upstream request budget is low.
- [ ] Keep the last successful forecast available offline for at least 24 hours.
- [ ] Add a manual retry button when weather loading fails.

## P2 — Product improvements

- [ ] Add severe-weather alerts for thunderstorms, heavy rain, and snow.
- [ ] Add favorite and recent locations.
- [ ] Add a dark map tile option.
- [ ] Add radar opacity controls.
- [ ] Add sunrise and sunset to the forecast.
- [ ] Add keyboard map navigation and improved screen-reader labels.
- [ ] Add PWA support for a stronger offline experience.

## P3 — Engineering

- [ ] Add a React error boundary around map and weather rendering.
- [ ] Debounce reverse geocoding and cancel outdated requests.
- [ ] Rate-limit Nominatim requests to one request per second.
- [ ] Add unit tests for weather translation, interpolation, and geo utilities.
- [ ] Add end-to-end tests for location search, map selection, and forecast loading.
- [ ] Respect `prefers-reduced-motion` in every animation.
