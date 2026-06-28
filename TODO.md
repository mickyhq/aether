# Aether Build Plan & Progress Tracking

Create the project using React/MUI/Vite ready to be deployed on Vercel.

## [x] Phase 1: Project Setup & Persistent Tracking
- [x] Create `index.html`, `src/main.ts` (or `src/main.js`), and `src/style.css`.
- [x] Set up a centered, responsive full-screen `<canvas id="weather-canvas">` element.
- [x] Configure Tailwind CSS or clean CSS variables for a modern glassmorphism UI overlay.
- [x] Confirm this `TODO.md` file exists in the repository root.

## [x] Phase 2: Open-Meteo Integration & Data Translation
- [x] Implement a location service that gets user coordinates via `navigator.geolocation` or defaults to Paris (`lat: 48.8566`, `lon: 2.3522`).
- [x] Write an asynchronous data fetcher targeting `https://api.open-meteo.com/v1/forecast`.
- [x] Build a robust translation module that parses the JSON response and normalizes the payload into a strictly typed `WeatherConfig` object containing:
    - `windSpeed` (normalized scalar)
    - `windAngle` (radians converted from degrees)
    - `rainDensity` (integer count of active particles)
    - `isThunderstorm` (boolean)
    - `cloudOpacity` (float between 0.0 and 1.0)

## [x] Phase 3: The High-Performance Physics Loop
- [x] Set up a robust, delta-time checked canvas resizing routine to handle window changes without stretching pixels.
- [x] Establish the native core render pipeline using `requestAnimationFrame()`.
- [x] Build a memory-safe `Vector2D` utility class handling basic vector arithmetic (add, multiply, mag, normalize).
- [x] Create an object-oriented Particle Management ecosystem with instantiation pools to prevent garbage collection spikes during continuous element spawning.

## [x] Phase 4: Creative Coding Simulation Implementation
- [x] **Wind Engine:** Implement a multi-layered particle system that drifts seamlessly across a dynamic grid space using math-driven flow forces.
- [x] **Precipitation Engine:** Render angled lines (rain) or drifting points (snow) responding dynamically to gravity and the Wind Engine's lateral force.
- [x] **Lightning Engine:** Write the recursive branching function for thunder intervals, handling flash alpha frame transitions securely.
- [x] **Cloud Engine:** Render volumetric, fluid-moving background canvas gradients that adjust opacity based on real-time barometric tracking data.

## [ ] Phase 5: UI Overlay & Production Polish
- [ ] Construct a floating glassmorphism dashboard widget showing the current City/Zone, Temperature (°C), Weather Description, and Wind Metric.
- [ ] Implement smooth interpolation blending transitions between weather changes (e.g., if switching cities from Sunny to Rainy, particle density must scale up smoothly rather than popping into existence).
- [ ] Perform a rigorous memory leak audit, ensuring animations maintain a consistent 60 fps over long periods without scaling CPU/RAM usage.
