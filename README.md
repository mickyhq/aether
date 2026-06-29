# Aether

[Live demo on Vercel](https://aether-five-rose.vercel.app)

Aether is an interactive full-screen weather map built with React, TypeScript, Material-UI, Leaflet, and Canvas. It displays live weather fields over OpenStreetMap and updates the visible area as the map moves.

![Aether weather map](public/example.png?raw=true&v=2)

## Features

- Animated wind particles colored by speed
- Zoom-independent animated 250 hPa jet-stream layer
- Distinct outlines for the northern and southern polar and subtropical jets
- Interpolated temperature layer and legend
- European AQI layer with PM2.5 readings
- Animated precipitation radar
- Saved radar opacity control
- Storm and lightning effects
- Weather values at the mouse position
- City search and animated map navigation
- Debounced, cancellable reverse geocoding that respects Nominatim request limits
- Persistent browser cache using IndexedDB
- Installable PWA with offline app shell and cached weather responses
- Automatic background refresh while the app is open
- Five-day ECMWF IFS visual forecast with timeline playback
- Adaptive map sample density when the upstream request budget is low
- Manual retry when weather data is stale or unavailable
- Reduced-motion support for weather, radar, map, and interface animations
- Isolated map and forecast error recovery
- Responsive, compact map controls
- Standard OpenStreetMap and CARTO Dark Matter tile styles
- Vercel deployment configuration

## Data sources

- [Open-Meteo](https://open-meteo.com/) supplies modeled temperature, wind, precipitation, cloud, and storm data.
- [ECMWF](https://www.ecmwf.int/) supplies the IFS forecast shown in the visual timeline through the Open-Meteo ECMWF API.
- [Copernicus Atmosphere Monitoring Service (CAMS)](https://atmosphere.copernicus.eu/) supplies modeled air-quality data through the Open-Meteo Air Quality API.
- [RainViewer](https://www.rainviewer.com/api.html) supplies precipitation radar tiles.
- [OpenStreetMap](https://www.openstreetmap.org/) supplies the base map.
- [CARTO](https://carto.com/basemaps/) supplies the optional Dark Matter base map.
- [MeteoGate](https://meteogate.eu/) supplies official European high-temperature warnings from MeteoAlarm members.

Open-Meteo data is licensed under [CC BY 4.0](https://open-meteo.com/en/license). Air-quality data requires attribution to both CAMS and Open-Meteo. RainViewer requires attribution and its free API is intended for personal, educational, and small-scale community use. OpenStreetMap tiles must follow the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

For a commercial or high-traffic deployment, review every provider's current terms and use production-grade map and radar providers where needed.

## Jet Stream layer

The Jet Stream layer uses its own data and animation pipeline. It requests wind speed and direction at 250 hPa from Open-Meteo, converts meteorological “wind from” bearings into eastward and northward vectors, and interpolates those vectors using geographic distance.

Jet Stream samples stay fixed while the camera zooms. This keeps the wind field and direction stable instead of rebuilding them from screen-space distances at every zoom level. Panning to a new area loads a new geographic sample grid.

Particle colors have two meanings:

- The inner color shows wind speed.
- The outer color identifies the latitude band: northern polar, northern subtropical, southern subtropical, or southern polar.

These four outline categories make the major jet regions easier to distinguish. They are latitude-based visualization bands, not detected jet-axis boundaries.

## Requirements

- Node.js 20.19 or newer
- npm

## Local development

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Nodemon restarts Vite when API, server, or Vite configuration files change; React source changes continue to use Vite hot reload.

## Cache version and invalidation

Disposable caches share `CACHE_VERSION` from `shared/cacheVersion.js`. The version is included in browser forecast keys, IndexedDB names, PWA API caches, and Vercel Runtime Cache namespaces. The latest successful location forecast remains available offline for 24 hours.

To invalidate cached data:

1. Increment `CACHE_VERSION` in `shared/cacheVersion.js`.
2. Deploy the application.
3. Verify the new application version in the Aether header.

The new deployment writes to fresh cache namespaces, so incompatible old data is ignored. Old browser and server cache entries expire naturally. Favorites, recent locations, the selected location, and map-style preferences are user data and are intentionally not cleared by a cache-version change.

Increment the cache version when a cached payload or storage schema becomes incompatible, or when a forced cache reset is required. Normal data refreshes do not need a version change.

## Cache monitoring

Vercel function logs emit structured `aether.cache` events for weather, air quality, and heat alerts. Sum `cacheHitCount`, `cacheMissCount`, `staleCount`, and `upstreamRequestCount` to monitor cache behavior. Coalesced requests count only the real upstream fetch.

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

The visual timeline currently uses ECMWF IFS through Open-Meteo's JSON API.
Native ECMWF API keys are intended for direct GRIB data workflows and are not
sent to Open-Meteo or the browser.

## Main structure

```text
src/
  components/   React interface and map components
  map/          Weather animation and radar layers
  services/     Weather, geocoding, and browser cache services
  weather/      Weather response translation
  types/        Shared TypeScript data types
```

## Accuracy

Wind, Jet Stream, and temperature layers use modeled grid values with interpolation between fetched points. They are not measurements for every map pixel. Jet Stream outlines use latitude bands for visual identification and do not represent exact atmospheric boundaries. Radar availability and resolution depend on RainViewer coverage.

## License

The Aether source code is available under the [MIT License](LICENSE). Third-party maps, weather data, radar tiles, icons, and libraries keep their own licenses and terms.
