# Aether improvement backlog

## Priority 1 — Build safety and abuse protection

- [ ] Convert `server/localApiMiddleware.js` and its request/response adapter types to TypeScript so the full verification TypeScript config passes again.
- [ ] Add one local `verify:all` command for client and server type checks, unit checks, production builds, PWA verification, and mobile plus desktop Playwright smoke journeys; document an optional local pre-push hook.
- [ ] Apply shared, distributed request limits and strict method/body validation to every public proxy, geocoding, error-reporting, and telemetry endpoint; do not rely on per-instance memory in serverless deployments.

## Priority 2 — Backend consistency and maintainability

- [ ] Convert the remaining `api`, `server`, and `shared` JavaScript modules to TypeScript, remove the remaining handwritten declarations, and enable strict server type checking in stages.
- [ ] Extract one typed provider-response pipeline for cache lookup, stale fallback, coalescing, timeout, backoff, quota diagnostics, schema validation, and response headers to remove repeated route logic.
- [ ] Split `weatherGrid`, `AetherMap`, and large provider modules into focused acquisition, normalization, interpolation, rendering, and UI orchestration units with narrow contracts.
- [ ] Move each language into its own translation catalog and add automated key and interpolation-placeholder parity checks before adding more locales.

## Priority 3 — Offline data and measurable quality

- [ ] Replace service-specific `localStorage` caches with one versioned IndexedDB repository that enforces schemas, TTLs, size limits, migration, and old-record cleanup.
- [ ] Add locally enforced performance budgets for initial JavaScript, lazy map/dashboard chunks, animation frame time, and map-data fetch volume, and report meaningful regressions from `verify:all`.
- [ ] Add automated accessibility checks and keyboard-only Playwright journeys for map controls, dialogs, layer controls, charts, alerts, and reduced-motion behavior.
