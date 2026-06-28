# Aether Improvement Plan

> Priorities: P0 = quick wins, P1 = high value, P2 = polish, P3 = future

---

## P0 — Bugs & Quick Fixes

- [x] **Deduplicate shared math utilities.** Extracted into `src/utils/geo.ts`.
- [x] **Fix distance calculation inconsistency.** Both modules now use haversine.
- [x] **Air quality storage → IndexedDB.** Migrated from `localStorage` to shared IndexedDB via `storage.ts`.
- [x] **Remove `current.precipitation` from `OpenMeteoCurrent` type.**
- [x] **Add `.vercel` to `.gitignore`.**
- [x] **Pin Leaflet CSS.** Already bundled via Vite import; no CDN link.

## P1 — UI/UX Improvements

- [x] **Hourly forecast panel.** The `WeatherConfig.evolution` array already contains 36 forecast frames. Added SVG line chart with temperature & precipitation bars under the metric grid.
- [ ] **Weather alerts layer.** Open-Meteo returns `weather_code` values for severe weather (thunderstorm 95/96/99, heavy snow 75/77/85/86). Surface a dismissible alert banner when the selected location has an active severe code.
- [ ] **Dark-mode map tiles.** Replace the default OpenStreetMap raster tiles with CartoDB `dark_all` tiles. URL: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`.
- [ ] **Favorites / recent locations.** Persist a list of up to 5 pinned locations in `localStorage`. Add a star icon in the header.
- [ ] **Retry button on error.** When `status` is an error string, show a clickable retry icon next to the status chip.
- [ ] **Toggle-able radar opacity.** The RainViewer radar layer is fixed at 0.58 opacity. Add a slider in precipitation/storm modes.
- [ ] **Keyboard map navigation.** Add `keyboard: true` to the map options and `tabindex` on the container.

## P2 — Architecture & Reliability

- [ ] **React error boundary.** Wrap `<AetherMap>` and `<WeatherCanvas>` in an error boundary.
- [ ] **Debounce reverse geocoding.** Add a 300 ms debounce or `AbortController` for rapid map clicks.
- [ ] **Nominatim rate limiting.** Add a `Promise`-based throttle wrapper (OSM policy: max 1 req/s).
- [ ] **`reducedMotion` pass-through.** `WeatherSimulation` does not check `prefers-reduced-motion` like `WeatherMapAnimation` does.
- [ ] **Add a `tsconfig.json` `paths` alias** for `@/` → `src/`.
- [ ] **Unit tests with Vitest.** Cover `translateWeather()`, `interpolateWeatherAt()`, geo utilities, `buildEvolution()`.

## P3 — Polish & Future Ideas

- [ ] **Animated weather transitions.** Smoothly interpolate particle density when switching locations.
- [ ] **PWA / offline support.** Add `vite-plugin-pwa` with service worker caching.
- [ ] **Wind barb or compass rose.** On the wind layer, draw rotation arrows near each grid point.
- [ ] **24h sun/moon timeline.** Show sunrise/sunset times from Open-Meteo's `daily` endpoint.
- [ ] **Shareable weather snapshot.** Encode `lat,lng,zoom,mode` in URL hash.
- [ ] **Satellite cloud layer.** Overlay geostationary satellite tile layer (e.g. NASA GIBS).
- [ ] **Multi-city comparison.** Split dashboard into columns for multiple pinned cities.