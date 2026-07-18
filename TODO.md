# High-impact roadmap

Only work that materially changes usefulness, trust, retention, or production
scalability belongs here. Small visual polish and isolated refactors are
intentionally excluded.

## P0 — Safety and trust

- [x] Build a unified official multi-hazard warning layer.
  - Replace the current heat-only location lookup with adapters for official
    CAP or GeoJSON feeds, starting with NWS and MeteoAlarm member warnings.
  - Cover storms, floods, wind, snow, fire weather, extreme temperatures, air
    quality, and other provider-issued hazards.
  - Render warning polygons on the map with severity, certainty, effective and
    expiry times, instructions, source, and update age.
  - Deduplicate overlapping or superseded alerts and clearly separate official
    warnings from Aether's forecast-derived fallback notices.
  - Keep stale official warnings only within a strict, visible grace period.

- [ ] Add a live observation and model-verification layer.
  - Ingest quality-controlled surface observations such as METAR/SYNOP stations
    and NOAA buoy data, with regional equivalents where licensing permits.
  - Show measured temperature, wind, pressure, precipitation, sea temperature,
    observation time, source, and quality flags at exact station locations.
  - Compare observations with Aether's model field and expose the local error,
    so users can distinguish measured conditions from interpolation.
  - Never interpolate stale or failed observations as if they were current.

## P1 — Forecast value

- [ ] Add probabilistic forecasts and honest uncertainty.
  - Fetch ensemble data for temperature, wind, and precipitation rather than
    presenting one deterministic model run as the only possible outcome.
  - Show median, likely range, precipitation probability, extreme thresholds,
    and model or ensemble disagreement through the forecast timeline.
  - Add a confidence field to the map and explain when confidence falls because
    lead time, sparse observations, or model disagreement increases.
  - Preserve the deterministic forecast as a clearly labelled fallback.

- [ ] Add opt-in watches and notifications for saved locations.
  - Let users define meaningful triggers for official warnings, extreme heat,
    heavy rain, strong wind, poor air quality, and nearby reported fires.
  - Deliver deduplicated Web Push notifications with quiet hours, expiry, source,
    and a direct link to the relevant map state.
  - Store only the minimum data needed for subscriptions and provide complete
    deletion and notification-history controls.
  - Run scheduled evaluation on the deployment platform or a dedicated worker,
    never through GitHub Actions.

- [ ] Build a departure-time route weather planner.
  - Accept a route and departure time, then sample weather at expected arrival
    times along the route instead of applying one location forecast everywhere.
  - Summarize rain, snow, wind, visibility, heat, air quality, and official
    warning exposure by route segment.
  - Highlight the worst segment and safer departure windows while clearly
    stating that Aether is not a navigation or emergency-decision system.

## P2 — Platform depth and scale

- [ ] Build historical replay and event comparison.
  - Add a unified time axis for retained radar, fire detections, official
    warnings, observations, and model fields.
  - Allow users to replay an event and compare what was forecast with what was
    later observed.
  - Use bounded server-side object storage and retention policies rather than
    relying on browser caches as an archive.
  - Make replay state shareable through a stable URL.

- [ ] Replace viewport coordinate fan-out with versioned weather-field tiles.
  - Generate or proxy cacheable, time-aware field tiles for weather, air quality,
    Jet Stream, ocean, and anomaly data keyed by provider model run.
  - Make one model run spatially consistent across users and eliminate seams or
    refresh differences between adjacent viewport batches.
  - Reuse tiles across visitors to sharply reduce upstream requests and make
    traffic growth independent from the number of sampled browser coordinates.
  - Preserve source resolution and quality metadata in every tile response.

## Existing engineering backlog

These earlier commitments remain in scope. They support the larger product
projects above and have not been replaced by this roadmap.

### Build safety and abuse protection

- [ ] Convert `server/localApiMiddleware.js` and its request/response adapter types to TypeScript so the full verification TypeScript config passes again.
- [ ] Add one local `verify:all` command for client and server type checks, unit checks, production builds, PWA verification, and mobile plus desktop Playwright smoke journeys; document an optional local pre-push hook.
- [ ] Apply shared, distributed request limits and strict method/body validation to every public proxy, geocoding, error-reporting, and telemetry endpoint; do not rely on per-instance memory in serverless deployments.

### Backend consistency and maintainability

- [ ] Convert the remaining `api`, `server`, and `shared` JavaScript modules to TypeScript, remove the remaining handwritten declarations, and enable strict server type checking in stages.
- [ ] Extract one typed provider-response pipeline for cache lookup, stale fallback, coalescing, timeout, backoff, quota diagnostics, schema validation, and response headers to remove repeated route logic.
- [ ] Split `weatherGrid`, `AetherMap`, and large provider modules into focused acquisition, normalization, interpolation, rendering, and UI orchestration units with narrow contracts.
- [ ] Move each language into its own translation catalog and add automated key and interpolation-placeholder parity checks before adding more locales.

### Offline data and measurable quality

- [ ] Replace service-specific `localStorage` caches with one versioned IndexedDB repository that enforces schemas, TTLs, size limits, migration, and old-record cleanup.
- [ ] Add locally enforced performance budgets for initial JavaScript, lazy map/dashboard chunks, animation frame time, and map-data fetch volume, and report meaningful regressions from `verify:all`.
- [ ] Add automated accessibility checks and keyboard-only Playwright journeys for map controls, dialogs, layer controls, charts, alerts, and reduced-motion behavior.


### Bugs
- [x] When zoomed out, panning makes the volcanos, quakes and other elements move and drift away from they real position.
