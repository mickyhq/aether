# Aether improvements

## Priority 1 — Map smoothness and performance

- [ ] Add a Low, Balanced, and High animation-quality control with Balanced as the default.

## Priority 2 — Reliability and regression coverage

- [ ] Add browser checks for map click selection, the layer menu, information popovers, webcams, and saved overlay restoration.
- [ ] Add animation checks for consistent wind motion across zoom levels and pause/resume after page visibility changes.
- [ ] Add fixture-based contract checks for every runtime response schema and reject invalid cached payloads during hydration.
- [ ] Consolidate visibility-aware polling, abort, online-resume, and cleanup behavior into one reusable scheduler hook.
- [ ] Add stale-age and last-success metadata to all browser data states so cached data never appears silently current.

## Priority 3 — Production readiness and data clarity

- [ ] Add client performance telemetry for animation frame time, long frames, failed providers, and aborted refreshes without collecting location history.
- [ ] Add quota and backoff diagnostics for weather, air quality, radar, geocoding, NOAA, webcam, and astronomy providers.
- [ ] Make the base-map tile endpoint configurable and document a production alternative to the public OpenStreetMap tile server.
- [ ] Show observation time, refresh time, source, and resolution consistently in map tooltips and dashboard cards.
- [ ] Convert remaining server provider modules from JavaScript plus handwritten declarations to TypeScript.
