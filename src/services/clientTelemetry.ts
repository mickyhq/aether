export type TelemetryProvider =
  'air-quality' |
  'ecmwf' |
  'geocoding' |
  'warnings' |
  'jet-stream' |
  'map-weather' |
  'ocean-currents' |
  'radar' |
  'reported-fires' |
  'seismic' |
  'soil-moisture' |
  'stargazing' |
  'temperature-records' |
  'temperature-anomaly' |
  'volcanoes' |
  'weather' |
  'webcams'

type ProviderCounters = {
  failures: number
  aborts: number
}

const FLUSH_INTERVAL_MS = 15_000
const LONG_FRAME_MS = 50
const MAX_FRAME_MS = 2_000
const providers = new Map<TelemetryProvider, ProviderCounters>()
let frameCount = 0
let frameTotalMs = 0
let frameMaximumMs = 0
let longFrameCount = 0
let flushTimer = 0
let lifecycleRegistered = false

export function recordAnimationFrame(frameTimeMs: number) {
  if (
    !Number.isFinite(frameTimeMs) ||
    frameTimeMs <= 0 ||
    frameTimeMs > MAX_FRAME_MS
  ) {
    return
  }

  frameCount += 1
  frameTotalMs += frameTimeMs
  frameMaximumMs = Math.max(frameMaximumMs, frameTimeMs)

  if (frameTimeMs >= LONG_FRAME_MS) {
    longFrameCount += 1
  }

  scheduleFlush()
}

export function recordProviderFailure(provider: TelemetryProvider) {
  updateProvider(provider, 'failures')
}

export function recordRefreshAbort(provider: TelemetryProvider) {
  updateProvider(provider, 'aborts')
}

export function recordProviderRequestError(
  provider: TelemetryProvider,
  error: unknown,
  signal?: AbortSignal
) {
  if (signal?.aborted || isAbortError(error)) {
    recordRefreshAbort(provider)
  } else {
    recordProviderFailure(provider)
  }
}

function updateProvider(
  provider: TelemetryProvider,
  kind: keyof ProviderCounters
) {
  const counters = providers.get(provider) ?? { failures: 0, aborts: 0 }

  counters[kind] += 1
  providers.set(provider, counters)
  scheduleFlush()
}

function scheduleFlush() {
  registerLifecycle()

  if (flushTimer) {
    return
  }

  flushTimer = window.setTimeout(() => {
    flushTimer = 0
    void flushTelemetry()
  }, FLUSH_INTERVAL_MS)
}

function registerLifecycle() {
  if (lifecycleRegistered) {
    return
  }

  lifecycleRegistered = true
  window.addEventListener('pagehide', () => {
    window.clearTimeout(flushTimer)
    flushTimer = 0
    void flushTelemetry()
  })
}

async function flushTelemetry() {
  const animation = frameCount > 0
    ? {
        sampleCount: frameCount,
        averageFrameMs: frameTotalMs / frameCount,
        maximumFrameMs: frameMaximumMs,
        longFrameCount
      }
    : null
  const providerEvents = [...providers.entries()].map(([provider, counts]) => ({
    provider,
    ...counts
  }))

  if (!animation && providerEvents.length === 0) {
    return
  }

  frameCount = 0
  frameTotalMs = 0
  frameMaximumMs = 0
  longFrameCount = 0
  providers.clear()

  try {
    await fetch('/api/client-telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ animation, providers: providerEvents }),
      keepalive: true
    })
  } catch {
    if (animation) {
      frameCount += animation.sampleCount
      frameTotalMs += animation.averageFrameMs * animation.sampleCount
      frameMaximumMs = Math.max(frameMaximumMs, animation.maximumFrameMs)
      longFrameCount += animation.longFrameCount
    }

    for (const event of providerEvents) {
      const counters = providers.get(event.provider) ?? {
        failures: 0,
        aborts: 0
      }

      counters.failures += event.failures
      counters.aborts += event.aborts
      providers.set(event.provider, counters)
    }

    scheduleFlush()
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}
