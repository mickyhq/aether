# Aether improvements

## Priority 1 — Fire-layer trust and reliability

- [x] Show loading, unavailable, missing-key, and last-updated states for every fire layer.
- [ ] Protect the NASA FIRMS proxy with rate limits, request coalescing, and stronger CDN caching.
- [ ] Put fire tiles in a separate short-lived PWA cache so they cannot evict weather responses.
- [ ] Add a visible legend explaining EFFIS detection-age colors and source timestamps.
- [ ] Replace the EFFIS `48h` label with `Today + yesterday`, or use exact rolling timestamps if supported.

## Priority 2 — Better fire data and controls

- [ ] Add stronger regional incident feeds: NIFC for the USA and CWFIS for Canada.
- [ ] Deduplicate reported fires using source incident IDs instead of rounded coordinates.
- [ ] Save enabled map overlays between sessions.
- [ ] Separate reported incidents from satellite detections in the layer control.
- [ ] Replace native `title` tooltips with keyboard- and touch-friendly information popovers.
- [ ] Add shared stale caching, cache metrics, provider failure counts, and quota alerts for fire routes.

## Priority 3 — Architecture and performance

- [ ] Share API handlers between local Vite development and Vercel production to prevent behavior drift.
- [x] Split `WeatherMapAnimation.ts` into smaller rendering and particle modules.
- [ ] Split `style.css` into component or feature styles.
- [ ] Extract polling and data-loading hooks from `App.tsx`.
- [ ] Extract map-layer setup and controls from `AetherMap.tsx`.
- [ ] Pause canvas animation, radar refresh, and unnecessary data fetching while the page is hidden.
- [ ] Add shared runtime schemas and types for server responses consumed by the browser.

## Priority 4 — Documentation and focused verification

- [ ] Document `FIRMS_MAP_KEY` in the Vercel deployment section.
- [ ] Document licenses and production usage limits for every fire-data provider.
- [ ] Add focused checks for tile-coordinate conversion, EFFIS date windows, EONET filtering, deduplication, and overlay lifecycle.
