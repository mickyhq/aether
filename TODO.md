# Aether improvements

## Priority 1 — Fire data and controls

- [ ] Deduplicate reported fires using source incident IDs instead of rounded coordinates.
- [ ] Replace native `title` tooltips with keyboard- and touch-friendly information popovers.

## Priority 2 — Architecture and performance

- [ ] Extract polling and data-loading hooks from `App.tsx`.
- [ ] Extract map-layer setup and controls from `AetherMap.tsx`.
- [ ] Pause canvas animation, radar refresh, and unnecessary data fetching while the page is hidden.
- [ ] Add shared runtime schemas and types for server responses consumed by the browser.

## Priority 3 — Documentation and focused verification

- [ ] Document licenses and production usage limits for every fire-data provider.
- [ ] Add focused checks for tile-coordinate conversion, EFFIS date windows, EONET filtering, deduplication, and overlay lifecycle.
