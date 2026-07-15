# Aether

[Live demo on Vercel](https://aether-five-rose.vercel.app)

Aether is a full-screen weather and environmental map built with React, TypeScript, Material UI, Leaflet, and Canvas. It combines animated weather fields, forecasts, ocean data, air quality, radar, and fire information in one responsive interface.

![Aether weather map](public/example.png?raw=true&v=2)

## Features

### Weather map

- Interpolated temperature field with a color legend
- Animated wind particles colored by speed
- Animated precipitation particles and RainViewer radar
- Storm mode with radar, cloud effects, rain, and lightning
- European AQI field with AQI and PM2.5 pointer values
- Worldwide 250 hPa Jet Stream animation
- Separate latitude-band outlines for northern and southern polar and subtropical jets
- Worldwide animated geostrophic ocean currents
- Ocean particles colored by NOAA sea-surface temperature
- Ocean hover values for current speed, direction, temperature, and OISST anomaly
- Weather, air quality, Jet Stream, ocean, and fire details at the pointer
- Nearest place name after pausing over the map
- Always-light OpenStreetMap base map

### Forecast and alerts

- Current temperature, wind, precipitation, storm state, air quality, sunrise, and sunset
- Five-day ECMWF IFS timeline with a time slider and playback
- Animated forecast preview for temperature, precipitation, snow, clouds, wind, and storms
- Standard Open-Meteo forecast fallback when ECMWF is unavailable
- Separate 12-hour temperature and precipitation chart
- Forecast playback updates the temperature, wind, precipitation, and storm map layers
- Official US heat alerts from the National Weather Service
- Official European heat warnings from MeteoAlarm members through MeteoGate when configured
- Local fallback alerts for forecast heat, thunderstorms, heavy rain, and snow
- Dismissible severe-weather alerts

### Locations and controls

- City search with animated map movement
- Click the map to select and reverse-geocode a location
- Saved favorite locations and five recent locations
- Selected location and weather mode stored in the URL
- Persistent radar-opacity control
- Persistent fire-overlay choices
- Persistent worldwide volcano-activity overlay
- Live, cached, stale, and unavailable data status
- Manual retry for stale or unavailable weather
- Keyboard map selection and responsive controls
- Reduced-motion behavior for map, radar, forecast, and interface animation
- Isolated recovery when the map or forecast UI crashes
- About dialog with author and provider links

### Fire information

The map layer control separates satellite detections from reported incidents:

- Worldwide NASA FIRMS VIIRS heat detections from the last 24 hours
- Copernicus EFFIS VIIRS detections for Africa from today and yesterday UTC
- Copernicus EFFIS VIIRS detections for Europe from today and yesterday UTC
- Reported open wildfires from US NIFC WFIGS, Canadian CWFIS, and NASA EONET
- Detection-age colors and EFFIS satellite-shape legend
- Hover details for heat detections and reported incidents
- Per-layer loading, ready, unavailable, and missing-key status
- Loaded time and reported-incident count when available
- Saved overlay selection between visits

Satellite hotspots are not confirmed fire perimeters. They may include industrial heat, volcanoes, agricultural burns, or other hot surfaces. Clouds, smoke, timing, and sensor limits can hide active fires. Reported-incident coverage is also incomplete and can lag. Do not use these layers for emergency decisions.

### Volcano activity

- Worldwide weekly activity reports from the Smithsonian Global Volcanism Program and USGS
- Separate markers for new eruptions, continuing eruptions, new unrest, and continuing unrest
- Report period, source summary, full weekly report, and volcano profile in each popup
- Saved overlay selection and six-hour background refresh

The weekly report is preliminary and intentionally not comprehensive. Rapidly developing activity may be missing or change after publication. Use local volcano observatories and emergency authorities for safety decisions.

### Reliability and offline use

- Installable Progressive Web App
- Offline app shell
- Cached API responses, radar tiles, and fire tiles
- IndexedDB weather and air-quality sample storage
- In-memory, Upstash Redis, and Vercel Runtime Cache layers
- Stale-data fallback when providers fail
- Automatic background refresh while the app is open
- Request coalescing to avoid duplicate provider calls
- Provider backoff after rate limits
- Adaptive weather and Jet Stream sampling when the upstream budget is low
- Structured cache, provider-failure, and quota logs on Vercel

## Data sources

| Source | Used for |
| --- | --- |
| [Open-Meteo](https://open-meteo.com/) | Current weather, hourly and daily forecasts, map weather fields, Jet Stream wind, and forecast fallback |
| [ECMWF](https://www.ecmwf.int/) | IFS 9 km forecast selected through the Open-Meteo forecast API |
| [Copernicus CAMS](https://atmosphere.copernicus.eu/) | Air-quality data delivered through the Open-Meteo Air Quality API |
| [NOAA NESDIS CoastWatch](https://coastwatch.noaa.gov/) | Daily global geostrophic surface currents |
| [NOAA OISST v2.1](https://www.ncei.noaa.gov/products/optimum-interpolation-sst) | Daily sea-surface temperature and anomaly data |
| [RainViewer](https://www.rainviewer.com/api.html) | Precipitation radar frames |
| [OpenStreetMap](https://www.openstreetmap.org/) | Base-map tiles |
| [Nominatim](https://nominatim.org/) | Location search and reverse geocoding |
| [US National Weather Service](https://www.weather.gov/) | Active US heat alerts |
| [MeteoGate](https://meteogate.eu/) | MeteoAlarm-member heat warnings in Europe |
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) | Global VIIRS heat and thermal-anomaly detections |
| [NIFC WFIGS](https://www.nifc.gov/) | Reported US wildfire incidents |
| [NRCan CWFIS](https://cwfis.cfs.nrcan.gc.ca/en/) | Reported Canadian active fires |
| [NASA EONET](https://eonet.gsfc.nasa.gov/) | Curated open wildfire events |
| [Copernicus EFFIS](https://forest-fire.emergency.copernicus.eu/) | Filtered VIIRS detections for Africa and Europe |
| [Smithsonian GVP / USGS](https://volcano.si.edu/reports_weekly.cfm) | Preliminary worldwide weekly volcanic activity reports |

Open-Meteo data is licensed under [CC BY 4.0](https://open-meteo.com/en/license). CAMS and Open-Meteo attribution is required for air-quality data. RainViewer requires attribution and limits use of its free API. OpenStreetMap tiles must follow the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/). Review every provider's current terms before commercial or high-traffic deployment.

## Layer notes

### Jet Stream

The Jet Stream layer requests wind speed and direction at 250 hPa, converts meteorological bearings into vectors, and interpolates them geographically. Samples remain stable while zooming. The colored outer bands identify northern polar, northern subtropical, southern subtropical, and southern polar latitude regions; they are visual guides, not detected jet axes.

### Ocean currents

The ocean layer loads a padded, resolution-aware viewport from NOAA. It uses daily eastward and northward geostrophic-current components plus OISST temperature and anomalies. Sampling ranges from the source's 0.25° grid at close zoom to at most 4° in a worldwide view. Fresh results are cached for six hours and stale results can be used for three days.

This product does not show tides, waves, rip currents, or detailed coastal flow. It is not suitable for navigation or safety decisions.

### Radar

Radar appears in Precipitation and Storm modes. Aether animates the six latest RainViewer frames, supports saved opacity, and shows only the latest frame when reduced motion is enabled.

### Fire overlays

NASA FIRMS uses a rolling 24-hour worldwide window and requires a server-side map key. EFFIS uses today and yesterday in UTC, which is a calendar window rather than an exact rolling 48 hours. EFFIS filters detections using confidence and land-cover information. Reported incidents are fetched independently, so remaining providers still work if one feed fails.

### Volcano activity

The volcano overlay uses the Smithsonian / USGS Weekly Volcanic Activity Report RSS feed. GeoRSS coordinates place each report on the map, while stable GVP volcano numbers link to the full report and volcano profile. The source normally updates on Thursday and does not claim to include every eruption or every continuously active volcano.

## Requirements

- Node.js 20.19 or newer
- npm

## Configuration

Create a `.env` file or set these server-side environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `FIRMS_MAP_KEY` | No | Enables worldwide NASA FIRMS heat-detection tiles |
| `METEOGATE_KEY` | No | Enables official European heat warnings |
| `ECMWF_KEY` | No | Uses the Open-Meteo customer endpoint for ECMWF before trying the free endpoint |
| `UPSTASH_REDIS_REST_URL` | No | Enables shared Upstash caching |
| `UPSTASH_REDIS_REST_TOKEN` | No | Authenticates the shared Upstash cache |

Without Upstash, production falls back to Vercel Runtime Cache and local development falls back to memory. US National Weather Service alerts, EFFIS, RainViewer, NOAA, OpenStreetMap, Nominatim, and the free Open-Meteo endpoints do not need project keys.

Request a [NASA FIRMS map key](https://firms.modaps.eosdis.nasa.gov/api/map_key/) if you want the worldwide heat-detection overlay.

## Local development

```bash
npm install
npm run dev
```

Open the URL printed by Vite. Nodemon restarts Vite when server, API, or Vite configuration files change. React source uses Vite hot reload.

Local development and Vercel production run the same handlers from `api/`. The local middleware only adapts the Node request and response objects.

## Commands

```bash
npm run dev       # Development server
npm run build     # TypeScript and Vite production build
npm run preview   # Preview the production build
npm test          # Unit tests
npm run test:e2e  # Browser journeys against an existing server
npm run verify    # Type checks, tests, build, and PWA verification
```

The production output is written to `dist/`. Set `E2E_BASE_URL` when browser journeys should use a non-default server URL.

## Caching and offline behavior

Disposable caches share `CACHE_VERSION` from `shared/cacheVersion.js`. It is included in browser forecast keys, IndexedDB names, PWA caches, Upstash keys, and Vercel Runtime Cache namespaces.

- Browser API requests use a network-first PWA cache
- Source tiles use a separate bounded cache so they cannot evict API responses
- Weather and air-quality samples persist in IndexedDB
- The latest successful location forecast can be used offline for up to 24 hours
- Server routes use fresh and stale records with provider-specific lifetimes
- Identical in-flight provider and tile requests are coalesced
- Weather and air-quality routes back off after provider rate limits
- User favorites, recents, selected location, radar opacity, and enabled fire overlays are not disposable cache data

When a cached payload or storage schema becomes incompatible:

1. Increment `CACHE_VERSION` in `shared/cacheVersion.js`.
2. Deploy the application.
3. Verify the new application version in the header.

Old cache namespaces expire naturally.

## Monitoring

Vercel functions emit structured `aether.cache` events with hit, miss, stale, and upstream counters. Fire routes also emit `aether.provider` events for provider failures and quota warnings. Fire responses include diagnostic cache, provider-failure, and quota headers. More guidance is in [docs/monitoring.md](docs/monitoring.md).

## Deploy to Vercel

Import the repository into Vercel. The included `vercel.json` uses Vite, runs `npm run build`, publishes `dist`, adds security headers, and applies long-lived caching to hashed assets.

Add any optional variables from the configuration table to Production and Preview. Keep all keys server-side; none are exposed through `VITE_` variables.

## Project structure

```text
api/          Vercel API route handlers
server/       Provider clients, caching, rate limits, and local API support
shared/       Browser/server cache, timeout, and validation utilities
src/
  components/ React interface components
  map/        Canvas weather renderers, radar, and fire layers
  services/   Browser data fetching, interpolation, and persistence
  styles/     Base, header, map, forecast, and responsive styles
  weather/    Weather translation and weather-code helpers
  types/      Shared TypeScript types
scripts/      Cache warming and PWA verification
tests/        Unit tests
e2e/          Browser journeys
```

## Accuracy and safety

Weather, air quality, Jet Stream, ocean, radar, and fire products come from different providers and update at different times. Gridded layers interpolate sampled values and are not measurements at every map pixel. Radar coverage and resolution vary by location. Fire detections and reported incidents can be delayed, incomplete, or wrong.

Aether is an awareness and visualization tool. Do not use it as the only source for navigation, emergency response, evacuation, marine safety, aviation, or other safety-critical decisions.

## License

The Aether source code is available under the [MIT License](LICENSE). Third-party maps, data, tiles, icons, and libraries retain their own licenses and terms.
