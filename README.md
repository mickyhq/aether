# Aether

[Live demo on Vercel](https://aether-five-rose.vercel.app)

Aether is an interactive full-screen weather map built with React, TypeScript, Material-UI, Leaflet, and Canvas. It displays live weather fields over OpenStreetMap and updates the visible area as the map moves.

![Aether weather map](public/example.png?raw=true&v=2)

## Features

- Animated wind particles colored by speed
- Worldwide animated ocean currents colored by sea-surface temperature
- NOAA RONI El Niño / La Niña state and OISST temperature anomalies
- Zoom-independent animated 250 hPa jet-stream layer
- Distinct outlines for the northern and southern polar and subtropical jets
- Interpolated temperature layer and legend
- European AQI layer with PM2.5 readings
- Animated precipitation radar
- Optional worldwide NASA FIRMS heat-detection layer for the last 24 hours
- Optional reported open-wildfire layer from NIFC WFIGS, NRCan CWFIS, and NASA EONET
- Copernicus EFFIS fire-detection coverage for Europe and the Mediterranean
- Saved radar opacity control
- Storm and lightning effects
- Weather values at the mouse position
- Nearest town or locality after briefly pausing the mouse over the map
- City search and animated map navigation
- Debounced, cancellable reverse geocoding that respects Nominatim request limits
- Persistent browser cache using IndexedDB
- Installable PWA with offline app shell, cached weather responses, and an isolated short-lived fire-tile cache
- Automatic background refresh while the app is open
- Five-day ECMWF IFS visual forecast with timeline playback
- Adaptive map sample density when the upstream request budget is low
- Manual retry when weather data is stale or unavailable
- Reduced-motion support for weather, radar, map, and interface animations
- Isolated map and forecast error recovery
- Responsive, compact map controls
- About dialog with author and links to every data provider
- Always-light OpenStreetMap basemap
- Vercel deployment configuration

## Data sources

- [Open-Meteo](https://open-meteo.com/) supplies modeled temperature, wind, precipitation, cloud, and storm data.
- [ECMWF](https://www.ecmwf.int/) supplies the IFS forecast shown in the visual timeline through the Open-Meteo ECMWF API.
- [Copernicus Atmosphere Monitoring Service (CAMS)](https://atmosphere.copernicus.eu/) supplies modeled air-quality data through the Open-Meteo Air Quality API.
- [NOAA NESDIS CoastWatch](https://coastwatch.noaa.gov/) supplies the daily global 0.25° geostrophic surface-current grid.
- [NOAA OISST v2.1](https://www.ncei.noaa.gov/products/optimum-interpolation-sst) supplies daily global sea-surface temperature and temperature anomalies.
- [NOAA Climate Prediction Center](https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/) supplies the Relative Oceanic Niño Index used to show the El Niño, La Niña, or neutral RONI state.
- [RainViewer](https://www.rainviewer.com/api.html) supplies precipitation radar tiles.
- [OpenStreetMap](https://www.openstreetmap.org/) supplies the base map.
- [MeteoGate](https://meteogate.eu/) supplies official European high-temperature warnings from MeteoAlarm members.
- [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) supplies global VIIRS active-fire and thermal-anomaly detections from the last 24 hours.
- [NIFC WFIGS](https://www.nifc.gov/) supplies current incident locations reported by United States wildfire agencies.
- [NRCan CWFIS](https://cwfis.cfs.nrcan.gc.ca/en/) supplies active fires reported by Canadian provincial, territorial, and federal agencies.
- [NASA EONET](https://eonet.gsfc.nasa.gov/) supplies curated wildfire events that sources still mark as open.
- [Copernicus EFFIS](https://forest-fire.emergency.copernicus.eu/) supplies filtered VIIRS fire detections for Europe and the Mediterranean.

Open-Meteo data is licensed under [CC BY 4.0](https://open-meteo.com/en/license). Air-quality data requires attribution to both CAMS and Open-Meteo. RainViewer requires attribution and its free API is intended for personal, educational, and small-scale community use. OpenStreetMap tiles must follow the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

For a commercial or high-traffic deployment, review every provider's current terms and use production-grade map and radar providers where needed.

## Jet Stream layer

The Jet Stream layer uses its own data and animation pipeline. It requests wind speed and direction at 250 hPa from Open-Meteo, converts meteorological “wind from” bearings into eastward and northward vectors, and interpolates those vectors using geographic distance.

Jet Stream samples stay fixed while the camera zooms. This keeps the wind field and direction stable instead of rebuilding them from screen-space distances at every zoom level. Panning to a new area loads a new geographic sample grid.

Particle colors have two meanings:

- The inner color shows wind speed.
- The outer color identifies the latitude band: northern polar, northern subtropical, southern subtropical, or southern polar.

These four outline categories make the major jet regions easier to distinguish. They are latitude-based visualization bands, not detected jet-axis boundaries.

## Ocean-current layer

The Ocean current switch loads the visible part of NOAA CoastWatch's daily global geostrophic surface-current grid. Animated particle direction follows the eastward and northward current components. Particle color shows NOAA OISST sea-surface temperature from -2°C to 34°C. Hovering over ocean water shows current speed and direction, temperature, and the local daily OISST anomaly.

The control also shows NOAA CPC's latest provisional Relative Oceanic Niño Index. A warm or cold label requires the RONI threshold to persist across five overlapping three-month seasons. RONI is one ocean index for ENSO monitoring, not a local current forecast or a complete atmospheric diagnosis.

The server requests only a padded, resolution-aware viewport and caches it for six hours. Sampling stays at 4° or finer worldwide and becomes denser down to the source's 0.25° grid as the map zooms in. Fast-current-biased particles and stronger trails keep narrow major currents visible without changing their temperature colors. A stale result remains usable for three days if NOAA is temporarily unavailable. The current product is a 0.25° altimetry-derived geostrophic field, so it does not resolve tides, waves, rip currents, or fine coastal flow. It is not for navigation or safety decisions.

## Heat-detection layer

The optional worldwide heat-detection overlay shows NASA FIRMS combined VIIRS heat detections from the last 24 hours. FIRMS updates its WMS data about every 15 minutes. The layer renders globally at every zoom level.

The FIRMS tile proxy limits each client to 240 requests per minute and coalesces simultaneous requests for the same tile into one upstream fetch. Successful tiles stay fresh in the browser and CDN for 15 minutes. The CDN may serve stale tiles while revalidating for one day, or during upstream failure for up to seven days.

These points are recent satellite hotspots, not confirmed fire perimeters or a guarantee that a fire is still burning. A detection may be an extinguished fire, volcano, industrial heat source, or another hot surface. Clouds, smoke, satellite timing, and sensor limits can also hide active fires. Use the layer for awareness, not emergency decisions.

The separate reported open-wildfire overlay prioritizes current NIFC WFIGS incidents in the United States and NRCan CWFIS active-fire reports in Canada, then adds recent NASA EONET events for broader coverage. Every returned incident marker remains rendered at every zoom level. Prescribed and extinguished fires are removed where the source exposes those fields. If one provider is unavailable, the remaining feeds still load. These reports are more meaningful than raw heat detections, but global coverage is incomplete and closure updates can lag; there is no single authoritative worldwide live incident feed.

The Europe fire-detection overlay uses the Copernicus European Forest Fire Information System (EFFIS) VIIRS layer for today and yesterday in UTC. This is a calendar-date window, not an exact rolling 48-hour period. EFFIS filters likely agricultural burns and false alarms using land cover, distance from artificial surfaces, and hotspot confidence. It covers Europe and the Mediterranean region and normally updates several times per day. These remain satellite detections, not firefighter-confirmed incidents, and can be hidden by cloud, smoke, satellite timing, or sensor limits.

When the EFFIS layer is enabled, its visible legend explains the detection-age colors and satellite marker shapes. It also shows the requested UTC source window and the latest successful tile-load time.

When any fire layer is enabled, a map status card shows whether it is loading, ready, unavailable, or missing the NASA FIRMS key. It also shows when successful data last loaded and the number of reported incidents when available.

The map layer control separates satellite heat detections from reported wildfire incidents so the two data types are not confused.

## Requirements

- Node.js 20.19 or newer
- npm

## Local development

Request a free [NASA FIRMS map key](https://firms.modaps.eosdis.nasa.gov/api/map_key/) and set `FIRMS_MAP_KEY` to enable the heat-detection overlay. The key stays on the server.

Create an Upstash Redis database through the Vercel Marketplace. The integration supplies `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Aether uses Upstash as the primary cache, Vercel Runtime Cache as a fallback in production, and memory as a fallback locally.

```bash
FIRMS_MAP_KEY=your_key_here
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
npm install
npm run dev
```

Open the local URL printed by Vite. Nodemon restarts Vite when API, server, or Vite configuration files change; React source changes continue to use Vite hot reload.

Local Vite development and Vercel production execute the same handlers from `api/`. Vite only adapts Node request and response objects. It uses Upstash when credentials are configured and otherwise falls back to memory locally, so route validation, caching rules, rate limits, headers, and error responses stay aligned.

## Cache version and invalidation

Disposable caches share `CACHE_VERSION` from `shared/cacheVersion.js`. The version is included in browser forecast keys, IndexedDB names, PWA API caches, Upstash keys, and Vercel Runtime Cache namespaces. The latest successful location forecast remains available offline for 24 hours. Weather, air quality, heat alerts, reported fires, fire tiles, and RainViewer radar stay fresh for at least two hours per unique request or tile. ECMWF, ocean currents, and geocoding use longer source-appropriate windows. Source tiles use a separate 384-entry PWA cache, so they cannot evict weather API responses.

The two-hour rule is per canonical cache key. Different coordinates, viewports, radar frames, or map tiles require different upstream records. Repeated requests for the same record are served by the browser cache, Vercel CDN, Upstash Redis, or Vercel Runtime Cache without calling the provider again during the fresh window.

OpenStreetMap basemap files remain on its provider CDN under its tile policy. The two-hour Aether cache covers API data plus radar and fire visualization tiles proxied by this project.

To invalidate cached data:

1. Increment `CACHE_VERSION` in `shared/cacheVersion.js`.
2. Deploy the application.
3. Verify the new application version in the Aether header.

The new deployment writes to fresh cache namespaces, so incompatible old data is ignored. Old browser and server cache entries expire naturally. Favorites, recent locations, the selected location, and enabled fire overlays are user data and are intentionally not cleared by a cache-version change.

Increment the cache version when a cached payload or storage schema becomes incompatible, or when a forced cache reset is required. Normal data refreshes do not need a version change.

## Cache monitoring

Vercel function logs emit structured `aether.cache` events for weather, air quality, heat alerts, radar, and all fire routes. Sum `cacheHitCount`, `cacheMissCount`, `staleCount`, and `upstreamRequestCount` to monitor cache behavior. Coalesced tile requests count only the real upstream fetch.

Fire providers also emit `aether.provider` events. Sum `providerFailureCount` by provider to track feed failures and `quotaAlertCount` to alert when a provider returns HTTP 429 or reports 10% or less quota remaining. Fire responses expose `X-Aether-Cache`, `X-Aether-Provider-Failures`, and, when needed, `X-Aether-Quota-Alert` headers for request-level diagnosis.

## Production build

```bash
npm run build
```

The production output is written to `dist`.

Run the unit tests with `npm test`.

Run browser journeys against the existing Vite server with `npm run test:e2e`. Set `E2E_BASE_URL` when the server uses another URL.

Run the full local verification pipeline with `npm run verify`. Cache and rendering alert guidance lives in [`docs/monitoring.md`](docs/monitoring.md).

To inspect the production build locally:

```bash
npm run preview
```

## Deploy to Vercel

Import the repository into Vercel. The included `vercel.json` configures:

- Vite as the framework
- `npm run build` as the build command
- `dist` as the output directory
- Long-lived caching for hashed assets
- A cached serverless proxy for Open-Meteo requests

Set `METEOGATE_KEY` in Vercel to enable official European heat warnings:

```text
METEOGATE_KEY=your-meteogate-api-key
```

Install Upstash Redis from the Vercel Marketplace and connect it to this project. Confirm these server-only variables exist in Production and Preview:

```text
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

The visual timeline currently uses ECMWF IFS through Open-Meteo's JSON API.
Native ECMWF API keys are intended for direct GRIB data workflows and are not
sent to Open-Meteo or the browser.

## Main structure

```text
src/
  components/   React interface and map components
  map/          Weather animation and radar layers
  services/     Weather, geocoding, and browser cache services
  styles/       Base, map, header, forecast, and responsive styles
  weather/      Weather response translation
  types/        Shared TypeScript data types
```

## Accuracy

Wind, Jet Stream, ocean-current, and temperature layers use gridded values with interpolation between fetched points. They are not measurements for every map pixel. Jet Stream outlines use latitude bands for visual identification and do not represent exact atmospheric boundaries. The ocean-current layer shows geostrophic surface flow, not tides or near-shore hazards. Radar availability and resolution depend on RainViewer coverage.

## License

The Aether source code is available under the [MIT License](LICENSE). Third-party maps, weather data, radar tiles, icons, and libraries keep their own licenses and terms.
