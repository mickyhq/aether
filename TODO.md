# Aether Improvement Plan

> Priorities: P0 = quick wins, P1 = high value, P2 = polish, P3 = future

---

## P0 — Bugs & Quick Fixes

- [ ] **Deduplicate shared math utilities.** `distanceInKilometers`, `inverseDistanceWeight`, `degreesToRadians`, `clamp`, `normalizeLongitude` are copy-pasted between `weatherGrid.ts` and `airQuality.ts`. Extract into `src/utils/geo.ts` and `src/utils/math.ts`.
- [ ] **Fix distance calculation inconsistency.** `weatherGrid.ts` uses a flat-earth approximation (111.32 km/deg) while `airQuality.ts` uses proper haversine. Both should use the same haversine implementation for accuracy.
- [ ] **Air quality storage → IndexedDB.** `airQuality.ts` persists to `localStorage` (5 MB limit) while `weatherCache.ts` uses IndexedDB. IndexedDB is better for growing spatial data. Unify on IndexedDB.
- [ ] **Remove `current.precipitation` from the `OpenMeteoCurrent` type** — it is no longer used after our fix and could confuse future readers.
- [ ] **Add a `.gitignore` entry for Vercel `.vercel` folder if not already present.**
- [ ] **Pin `leaflet` CSS in `index.html`** — it is currently loaded via CDN; bundle it or add SRI hash for security.

---

## P1 — UI/UX Improvements

- [ ] **Hourly forecast panel.** The `WeatherConfig.evolution` array already contains 36 forecast frames. Add a small scrollable bar chart or line chart under the metric grid showing temperature & precipitation trends over the next 12–24 hours.
- [ ] **Weather alerts layer.** Open-Meteo returns `weather_code` values for severe weather (thunderstorm 95/96/99, heavy snow 75/77/85/86). Surface a dismissible alert banner when the selected location has an active severe code.
- [ ] **Dark-mode map tiles.** Replace the default OpenStreetMap raster tiles with CartoDB `dark_all` tiles when the theme is dark (always). The current light-grey OSM tiles clash with the dark glass UI. URL: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`.
- [ ] **Favorites / recent locations.** Persist a list of up to 5 pinned locations in `localStorage`. Add a star icon in the header that opens a dropdown.
- [ ] **Retry button on error.** When `status` is an error string, show a clickable retry icon next to the status chip that re-triggers `loadWeather()`.
- [ ] **Toggle-able radar opacity.** The RainViewer radar layer is fixed at 0.58 opacity. Add a small slider in the precipitation/storm modes to let users adjust it.
- [ ] **Keyboard map navigation.** Leaflet supports keyboard panning out of the box; add `keyboard: true` to the map options and a `tabindex` on the map container.

---

## P2 — Architecture & Reliability

- [ ] **React error boundary.** Wrap `<AetherMap>` and `<WeatherCanvas>` in an error boundary that shows a fallback UI instead of a white screen if Leaflet or Canvas fails.
- [ ] **Debounce reverse geocoding.** Rapid map clicks fire a Nominatim request each time. Add a 300 ms debounce or abort the previous in-flight request with an `AbortController`.
- [ ] **Nominatim rate limiting.** OSM's usage policy asks for max 1 req/s. Add a `Promise`-based throttle wrapper for `reverseGeocode()`.
- [ ] **`reducedMotion` pass-through.** `WeatherSimulation` does not check `prefers-reduced-motion` like `WeatherMapAnimation` does. Add the check and skip particle animations when set.
- [ ] **Add a `tsconfig.json` `paths` alias** for `@/` → `src/` to clean up the deep relative imports (e.g. `../../../services/weatherGrid`).
- [ ] **Unit tests with Vitest.** The project already uses Vite; add `vitest` and cover:
  - `translateWeather()` — various weather codes → correct descriptions
  - `interpolateWeatherAt()` — IDW interpolation correctness
  - `degreesToRadians` / `normalizeLongitude` — edge cases
  - `buildEvolution()` — correct frame count and defaults for missing fields

---

## P3 — Polish & Future Ideas

- [ ] **Animated weather transitions.** Phase 5 of the original build plan is still open. Smoothly interpolate `rainDensity`, `cloudOpacity`, and `windSpeed` when `selectedLocation` changes, so particles fade in/out over ~1 second instead of snapping.
- [ ] **PWA / offline support.** Add a service worker (`vite-plugin-pwa`) to cache the app shell + last-known weather data. Show a "You're offline — showing cached data" banner.
- [ ] **Wind barb or compass rose.** On the wind layer, draw small wind barbs or rotation arrows near each grid point instead of just displaying km/h text.
- [ ] **24h sun/moon timeline.** Show sunrise/sunset times from Open-Meteo's `daily` endpoint. A tiny timeline bar under the dashboard title.
- [ ] **Shareable weather snapshot.** Add a "Copy link" button that encodes `lat,lng,zoom,mode` in the URL hash so users can share exactly what they're looking at.
- [ ] **Satellite cloud layer.** Overlay a geostationary satellite tile layer (e.g. from NASA GIBS or OSM's cloudless tiles) for a realistic cloud-view mode.
- [ ] **Multi-city comparison.** Let users split the dashboard into 2–3 columns, each pinned to a different city, for travel planning.