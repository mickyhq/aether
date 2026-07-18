# Aether

[Live demo on Vercel](https://aether-five-rose.vercel.app)

Aether is a full-screen weather and environmental map built with React, TypeScript, Material UI, Leaflet, and Canvas. It combines animated weather fields, forecasts, ocean data, air quality, radar, and fire information in one responsive interface.

![Aether weather map](public/example.png?raw=true&v=2)

## Features

### Weather map

- Interpolated temperature field with a color legend
- Land temperature-anomaly field comparing current conditions with the 1991–2020 ERA5-Land normal for the same UTC hour and calendar day
- Animated wind particles colored by speed
- Animated precipitation particles and RainViewer radar
- Combined precipitation and storm mode with radar, rain, storm signals, and lightning
- European AQI field with AQI and PM2.5 pointer values
- Worldwide 250 hPa Jet Stream animation
- Separate latitude-band outlines for northern and southern polar and subtropical jets
- Worldwide animated geostrophic ocean currents
- Ocean particles colored by NOAA sea-surface temperature
- Ocean click values for current speed, direction, temperature, and OISST anomaly
- Weather, air quality, Jet Stream, ocean, and fire details at the clicked point
- Latest radar check for rain at the exact clicked map cell
- Nearest place name after clicking the map
- Always-light vector base map with English labels

### Forecast and alerts

- Current temperature, wind, precipitation, storm state, air quality, sunrise, and sunset
- Five-day ECMWF IFS timeline with a time slider and playback
- Animated forecast preview for temperature, precipitation, snow, clouds, wind, and storms
- Standard Open-Meteo forecast fallback when ECMWF is unavailable
- Separate 12-hour temperature and precipitation chart
- Forecast playback updates the temperature, wind, precipitation, and storm map layers
- Official NWS and MeteoAlarm-member warnings for storms, floods, wind, snow, fire weather, extreme temperatures, air quality, and other issued hazards
- Warning polygons with severity, certainty, effective/expiry times, instructions, source, update age, and a visible 15-minute stale grace state
- Deduplicated official updates, shown separately from Aether forecast notices for heat, thunderstorms, heavy rain, and snow
- Dismissible severe-weather alerts

### Locations and controls

- City search with animated map movement
- Click the map to select and reverse-geocode a location
- Saved favorite locations and five recent locations
- Selected location and weather mode stored in the URL
- Persistent radar-opacity control
- Persistent fire-overlay choices
- Persistent worldwide volcano-activity overlay
- One weather-and-quake popup for overlapping earthquake reports
- Combined weather and activity details when clicking a volcano
- Live, cached, stale, and unavailable data status
- Manual retry for stale or unavailable weather
- Keyboard map selection and responsive controls
- Responsive regional zoom limit prevents zooming out to a full-world view
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
- Coordinate-centered point markers at world zoom keep volcano locations accurate
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
| [Open-Meteo](https://open-meteo.com/) | Current weather, hourly and daily forecasts, map weather fields, Jet Stream wind, ERA5-Land historical normals, and forecast fallback |
| [ECMWF](https://www.ecmwf.int/) | IFS 9 km forecast selected through the Open-Meteo forecast API |
| [Copernicus CAMS](https://atmosphere.copernicus.eu/) | Air-quality data delivered through the Open-Meteo Air Quality API |
| [NOAA NESDIS CoastWatch](https://coastwatch.noaa.gov/) | Daily global geostrophic surface currents |
| [NOAA OISST v2.1](https://www.ncei.noaa.gov/products/optimum-interpolation-sst) | Daily sea-surface temperature and anomaly data |
| [RainViewer](https://www.rainviewer.com/api.html) | Precipitation radar frames |
| [OpenFreeMap / OpenMapTiles](https://openfreemap.org/) | Vector base-map rendering and localized labels |
| [OpenStreetMap](https://www.openstreetmap.org/) | Base-map data |
| [Nominatim](https://nominatim.org/) | Location search and reverse geocoding |
| [US National Weather Service](https://www.weather.gov/) | Active US CAP warnings and zone geometries |
| [MeteoAlarm](https://api.meteoalarm.org/) | CAP and GeoJSON warnings issued by European member services |
| [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/earthquakes/feed/) | Real-time magnitude 2.5+ earthquake GeoJSON for the past day |
| [NOAA Tsunami Warning Centers](https://www.tsunami.gov/?page=productRetrieval) | Official NTWC and PTWC tsunami CAP messages |
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) | Global VIIRS heat and thermal-anomaly detections |
| [NIFC WFIGS](https://www.nifc.gov/) | Reported US wildfire incidents |
| [NRCan CWFIS](https://cwfis.cfs.nrcan.gc.ca/en/) | Reported Canadian active fires |
| [NASA EONET](https://eonet.gsfc.nasa.gov/) | Curated open wildfire events |
| [Copernicus EFFIS](https://forest-fire.emergency.copernicus.eu/) | Filtered VIIRS detections for Africa and Europe |
| [Smithsonian GVP / USGS](https://volcano.si.edu/reports_weekly.cfm) | Preliminary worldwide weekly volcanic activity reports |
| [7Timer Astro](https://www.7timer.info/doc.php?lang=en) | Three-day cloud, astronomical seeing, and atmospheric-transparency forecasts |
| [World Atlas of Artificial Night Sky Brightness](https://doi.org/10.1126/sciadv.1600377) | Estimated light-pollution class for the stargazing index |
| [Windy Webcams](https://www.windy.com/webcams) | Nearby public webcam players |

Open-Meteo data is licensed under [CC BY 4.0](https://open-meteo.com/en/license). CAMS and Open-Meteo attribution is required for air-quality data. RainViewer requires attribution and limits use of its free API. OpenFreeMap requires attribution and provides its public instance without an SLA; self-host or choose a supported provider when production requirements demand one. Review every provider's current terms before commercial or high-traffic deployment.

The stargazing rating is guidance, not an observatory forecast. Its Bortle value is estimated from a static artificial-sky-brightness class, and 7Timer permits free non-commercial redistribution under its published terms.

### Fire-data licenses and production limits

These terms were checked on 15 July 2026. Provider terms can change, so review the linked source before a commercial or high-traffic deployment.

| Provider | Reuse and attribution | Production usage limits |
| --- | --- | --- |
| [NASA FIRMS](https://www.earthdata.nasa.gov/engage/open-data-services-software/data-use-policy) | NASA Earth Science data are generally CC0 unless a dataset carries another notice. Acknowledge NASA and FIRMS, do not imply NASA endorsement, and preserve any third-party notices. | A free `MAP_KEY` is required. FIRMS allows [5,000 transactions per 10-minute interval](https://firms.modaps.eosdis.nasa.gov/mapserver/wms-info/); larger requests can count more than once. Ask FIRMS for a higher limit or use its bulk downloads/GIBS guidance for very high traffic. |
| [Copernicus EFFIS](https://forest-fire.emergency.copernicus.eu/about-effis/data-license) | EU-owned EFFIS content is CC BY 4.0 unless marked otherwise. Credit the European Union/Copernicus EFFIS, link the license, and identify changes. Third-party material keeps its own rights. | EFFIS says its standard WMS data are freely accessible. It publishes no numeric request quota; use caching and the [data request form](https://forest-fire.emergency.copernicus.eu/applications/data-and-services) for data not exposed by its web services. |
| [NIFC WFIGS / IRWIN](https://www.arcgis.com/home/item.html?id=44776b299f2842479f0bad4541c81eb9) | The public service identifies NIFC and IRWIN as its sources and carries a no-warranty, appropriate-use disclaimer rather than a separate permissive license. Keep source credit and do not present the feed as a legal or guaranteed record. | No numeric request quota is published. The ArcGIS layer caps a query at 2,000 records and refreshes from IRWIN every five minutes; page queries when needed, cache responses, and do not poll faster than the source changes. |
| [NRCan CWFIS](https://cwfis.cfs.nrcan.gc.ca/downloads/activefires/activefires_metadata_NAP_ISO_19115_2003_EN.pdf) | Active-fire data are under the [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada). Attribute Natural Resources Canada/Canadian Forest Service and retain source notices. | No numeric request quota is published. CWFIS says agency-reported active fires normally update every two hours in fire season and every six hours in winter; cache data and avoid polling faster than that cadence. |
| [NASA EONET](https://eonet.gsfc.nasa.gov/docs/v3) | NASA-hosted scientific data follow NASA's open-data guidance unless marked otherwise. Credit NASA EONET and the original event sources linked in each record; third-party source material can have separate rights. | EONET requires no API key and publishes no numeric request quota. Use API filters and `limit`, cache results, and contact EONET before sustained high-volume production use. |

Aether proxies these feeds, coalesces duplicate requests, caches reported incidents for two hours, keeps a 24-hour stale fallback, and records provider failures and quota headers. That protects both availability and upstream services; it does not override provider terms.

## Layer notes

### Jet Stream

The Jet Stream layer requests wind speed and direction at 250 hPa, converts meteorological bearings into vectors, and interpolates them geographically. Samples remain stable while zooming. The colored outer bands identify northern polar, northern subtropical, southern subtropical, and southern polar latitude regions; they are visual guides, not detected jet axes.

### Temperature anomaly

The temperature-anomaly layer subtracts the 1991–2020 ERA5-Land average for the same UTC hour and calendar day from the current map temperature. Blue is colder than normal, white is near normal, and red is warmer than normal. Aether samples a coarse climatology grid, interpolates it across the viewport, and caches each normal for one year. Hover details show current temperature, normal temperature, difference, baseline, source, and resolution.

### Ocean currents

The ocean layer loads a padded, resolution-aware viewport from NOAA. It uses daily eastward and northward geostrophic-current components plus OISST temperature and anomalies. Sampling ranges from the source's 0.25° grid at close zoom to at most 4° in a worldwide view. Fresh results are cached for six hours and stale results can be used for three days.

This product does not show tides, waves, rip currents, or detailed coastal flow. It is not suitable for navigation or safety decisions.

### Radar

Radar appears in the combined Precipitation & storms mode. Its timeline joins the six latest observed RainViewer frames to the next 12 model-forecast hours. RainViewer discontinued public future-radar frames in 2026, so future frames are clearly labeled model forecasts rather than observed radar. Aether renders them as transparent, radar-style precipitation bands with animated rain and storm-risk marks; a bottom legend maps every forecast color to rain rate in mm/h. The selected-location panel uses ECMWF when available. The forecast field remains visible with reduced motion enabled. Aether supports saved radar opacity and shows a static radar frame when reduced motion is enabled. Visual radar tiles load through Aether's same-origin radar proxy and are cached by the service worker; failed or incomplete frames never replace the last complete frame. World views scale the more detailed zoom-2 source tiles down instead of using sparse zoom-0 tiles.

The map tooltip samples the newest unsmoothed RainViewer radar tile through Aether's same-origin proxy at the clicked coordinate. It reports rain only above a small reflectivity threshold, verifies radar coverage before reporting no rain, and shows the observation age. Click checks are debounced; metadata, decoded tiles, immutable frame tiles, and the coverage mask are cached separately to avoid repeated provider requests. Public RainViewer tiles are limited to zoom level 7, so this is the finest open composite cell available from this feed, not a rain-gauge measurement.

### Fire overlays

NASA FIRMS uses a rolling 24-hour worldwide window and requires a server-side map key. EFFIS uses today and yesterday in UTC, which is a calendar window rather than an exact rolling 48 hours. EFFIS filters detections using confidence and land-cover information. Reported incidents are fetched independently, so remaining providers still work if one feed fails.

### Volcano activity

The volcano overlay uses the Smithsonian / USGS Weekly Volcanic Activity Report RSS feed. GeoRSS coordinates place each report on the map, while stable GVP volcano numbers link to the full report and volcano profile. The source normally updates on Thursday and does not claim to include every eruption or every continuously active volcano.

### Earthquakes and tsunami warnings

The seismic overlay shows USGS earthquakes of magnitude 2.5 or greater from the past day. Marker size follows magnitude; USGS alert colors and tsunami-product flags remain visible in details. A tsunami product flag is not treated as an active warning.

Official tsunami warnings, advisories, watches, and threat messages come from the NOAA National and Pacific Tsunami Warning Centers' CAP feeds. Information and final messages are excluded. Stale or newly expired official messages remain visibly marked for no more than 15 minutes, then disappear.

## Requirements

- Node.js 20.19 or newer
- npm

## Configuration

Create a `.env` file or set these environment variables:

| Variable | Scope | Required | Purpose |
| --- | --- | --- | --- |
| `FIRMS_MAP_KEY` | Server | No | Enables worldwide NASA FIRMS heat-detection tiles |
| `WINDY_KEY` | Server | No | Enables nearby public webcams from Windy |
| `METEOALARM_TOKEN` | Server | No | Enables the official MeteoAlarm EDR warning feed for Europe |
| `METEOGATE_KEY` | Server | No | Legacy MeteoGate access fallback for MeteoAlarm-member warnings |
| `ECMWF_KEY` | Server | No | Uses the Open-Meteo customer endpoint for ECMWF before trying the free endpoint |
| `UPSTASH_REDIS_REST_URL` | Server | No | Enables shared Upstash caching |
| `UPSTASH_REDIS_REST_TOKEN` | Server | No | Authenticates the shared Upstash cache |
| `VITE_BASE_MAP_STYLE_URL` | Browser | No | MapLibre style endpoint; defaults to OpenFreeMap Positron |
| `VITE_BASE_MAP_ATTRIBUTION` | Browser | No | Attribution shown for the configured style and its data |

Without Upstash, production falls back to Vercel Runtime Cache and local development falls back to memory. OpenFreeMap, US National Weather Service alerts, EFFIS, RainViewer, NOAA, Nominatim, and the free Open-Meteo endpoints do not need project keys.

Request a [NASA FIRMS map key](https://firms.modaps.eosdis.nasa.gov/api/map_key/) if you want the worldwide heat-detection overlay.

Request a [Windy Webcams API key](https://api.windy.com/keys) to enable nearby live cameras. Camera players are loaded only when the webcam panel is opened.

### Production base map

The default OpenFreeMap endpoint is useful for development and modest public
traffic, but its public instance has no service-level agreement. Production
deployments can use a managed MapLibre-compatible style from
[MapTiler Cloud](https://docs.maptiler.com/maplibre/) or self-host OpenMapTiles
with [TileServer GL](https://openmaptiles.org/docs/host/tileserver-gl/).

Example managed configuration:

```dotenv
VITE_BASE_MAP_STYLE_URL=https://api.maptiler.com/maps/streets-v2/style.json?key=YOUR_PUBLIC_BROWSER_KEY
VITE_BASE_MAP_ATTRIBUTION=© MapTiler · © OpenStreetMap contributors
```

The style document must be reachable over HTTPS in production and must include
working HTTPS tile, glyph, and sprite URLs. Set the attribution required by both
the host and the underlying map data. `VITE_` values are embedded in browser
JavaScript, so use only a public, origin-restricted browser key here. Keep all
secret provider keys in server-only variables.

## Local development

```bash
npm install
npm run dev
```

Open the URL printed by Vite. Nodemon restarts Vite when server, API, or Vite configuration files change. React source uses Vite hot reload.

Local development and Vercel production run the same handlers from `routes/`. The local middleware only adapts the Node request and response objects. Production dispatches every public API URL through one Vercel Function so Hobby deployments remain below the function-count limit.

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
api/          Single Vercel Function entrypoint
routes/       API route handlers shared by local and production dispatchers
server/       Provider clients, caching, routing, and local API support
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
