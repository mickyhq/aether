import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

type AnimationProbeFrame = {
  time: number
  points: Array<[number, number]>
}

type AnimationProbe = {
  enabled: boolean
  frames: AnimationProbeFrame[]
  currentFrame: AnimationProbeFrame | null
  setPageVisible: (visible: boolean) => void
}

type AnimationProbeWindow = Window & typeof globalThis & {
  __aetherAnimationProbe: AnimationProbe
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    let pageVisible = true
    const probe: AnimationProbe = {
      enabled: false,
      frames: [],
      currentFrame: null,
      setPageVisible: visible => {
        pageVisible = visible
        document.dispatchEvent(new Event('visibilitychange'))
      }
    }
    const browserWindow = window as AnimationProbeWindow
    const originalClearRect = CanvasRenderingContext2D.prototype.clearRect
    const originalLineTo = Path2D.prototype.lineTo

    browserWindow.__aetherAnimationProbe = probe
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => pageVisible ? 'visible' : 'hidden'
    })
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => !pageVisible
    })

    CanvasRenderingContext2D.prototype.clearRect = function (
      x,
      y,
      width,
      height
    ) {
      if (
        probe.enabled &&
        this.canvas.classList.contains('weather-map-animation-canvas')
      ) {
        const frame: AnimationProbeFrame = {
          time: performance.now(),
          points: []
        }

        probe.currentFrame = frame
        probe.frames.push(frame)

        if (probe.frames.length > 180) {
          probe.frames.shift()
        }
      }

      originalClearRect.call(this, x, y, width, height)
    }

    Path2D.prototype.lineTo = function (x, y) {
      const frame = probe.currentFrame

      if (probe.enabled && frame && frame.points.length < 1000) {
        frame.points.push([x, y])
      }

      originalLineTo.call(this, x, y)
    }
  })

  await page.route('**/api/weather?**', async route => {
    const url = new URL(route.request().url())

    if (url.searchParams.get('resource') === 'webcams') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          configured: true,
          radiusKm: 100,
          total: 1,
          webcams: [{
            id: 101,
            title: 'Alpine weather camera',
            city: 'Test Valley',
            distanceKm: 12,
            playerUrl: 'https://webcams.windy.com/test/player',
            detailUrl: 'https://www.windy.com/webcams/test',
            live: true,
            updatedAt: '2026-06-29T10:00:00Z'
          }]
        })
      })
      return
    }

    const latitudes = url.searchParams.get('latitude')?.split(',') ?? ['0']
    const longitudes = url.searchParams.get('longitude')?.split(',') ?? ['0']
    const payloads = latitudes.map((latitude, index) => (
      buildForecast(Number(latitude), Number(longitudes[index] ?? 0))
    ))

    await route.fulfill({
      contentType: 'application/json',
      headers: {
        'X-Aether-Cache': 'upstream'
      },
      body: JSON.stringify(payloads.length === 1 ? payloads[0] : payloads)
    })
  })

  await page.route('**/api/air-quality?**', async route => {
    const url = new URL(route.request().url())
    const latitudes = url.searchParams.get('latitude')?.split(',') ?? ['0']
    const longitudes = url.searchParams.get('longitude')?.split(',') ?? ['0']
    const payloads = latitudes.map((latitude, index) => ({
      latitude: Number(latitude),
      longitude: Number(longitudes[index] ?? 0),
      current: {
        european_aqi: 24,
        pm2_5: 4,
        pm10: 8,
        nitrogen_dioxide: 6,
        ozone: 42
      }
    }))

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(payloads.length === 1 ? payloads[0] : payloads)
    })
  })

  await page.route('**/api/warnings?**', route => (
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        generatedAt: new Date().toISOString(),
        cacheState: 'live',
        gracePeriodMinutes: 15,
        warnings: [],
        providers: []
      })
    })
  ))
  await page.route('**/api/fire-layer-status', route => (
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ firmsConfigured: true })
    })
  ))
  await page.route('**/api/reported-fires', route => (
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ fires: [] })
    })
  ))
  await page.route('**/api/volcano-activity', route => (
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ volcanoes: [] })
    })
  ))
  await page.route('**/api/radar', route => (
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ frames: [] })
    })
  ))
  await page.route('**/api/ecmwf?**', route => (
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(buildForecast(48, 2))
    })
  ))
  await page.route('**/api/geocode?**', route => {
    const url = new URL(route.request().url())

    if (url.searchParams.get('type') === 'search') {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          location: {
            label: 'Lyon, Auvergne-Rhône-Alpes, France',
            latitude: 45.764,
            longitude: 4.8357
          }
        })
      })
    }

    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ label: 'Map Pick, Test State' })
    })
  })
  await page.route('https://api.rainviewer.com/**', route => (
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        host: '',
        radar: { past: [] }
      })
    })
  ))
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort())
  await page.route('https://*.basemaps.cartocdn.com/**', route => route.abort())
  await page.route('https://tiles.openfreemap.org/**', route => route.abort())
})

test('loads the selected location forecast', async ({ page }) => {
  const forecastRequest = page.waitForRequest(request => (
    request.url().includes('/api/weather?') &&
    request.url().includes('forecast_days=7')
  ))

  await page.goto('/')
  await forecastRequest

  await expect(page.getByRole('status')).toHaveText('Live')
  await expect(page.getByRole('button', { name: 'Temp: 21°C' })).toBeVisible()
  await expect(
    page.getByRole('img', {
      name: '12-hour temperature and precipitation forecast'
    })
  ).toBeVisible()
  await expect(page.getByLabel('ECMWF visual forecast')).toBeVisible()
  await expect(page.getByLabel('ECMWF forecast time')).toBeVisible()
  await expect(page.getByLabel('Forecast date')).toHaveCount(0)

  await page.getByRole('button', { name: 'Play ECMWF forecast' }).click()
  await expect(page.getByLabel('Forecast date')).toContainText('Forecast')
  await page.getByRole('button', { name: 'Pause ECMWF forecast' }).click()
  await expect(page.getByLabel('Forecast date')).toBeVisible()
})

test('shows saved-data status when the browser goes offline', async ({
  context,
  page
}) => {
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Live')

  await context.setOffline(true)

  await expect(page.getByText('Offline · showing saved weather')).toBeVisible()
})

test('searches for a location and loads its forecast', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Search city').fill('Lyon')
  await page.getByRole('button', { name: 'Search' }).click()

  await expect(
    page.getByRole('region', {
      name: 'Interactive weather map for Lyon, Auvergne-Rhône-Alpes, France'
    })
  ).toBeVisible()
  await expect(page).toHaveURL(/coords=45\.76400%2C4\.83570/)
  await expect(page.getByRole('status')).toHaveText(/^(Live|Cached)$/)
})

test('shows a useful error for an unknown city', async ({ page }) => {
  await page.route('**/api/geocode?**', route => route.fulfill({
    status: 502,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'City not found' })
  }))
  await page.goto('/')

  await page.getByLabel('Search city').fill('not-a-city')
  await page.getByRole('button', { name: 'Search' }).click()

  await expect(page.getByRole('status')).toHaveText('City not found')
})

test('selects a location from the map', async ({ page }) => {
  let reverseGeocodeRequests = 0

  await page.route('**/api/geocode?**', route => {
    const url = new URL(route.request().url())

    if (url.searchParams.get('type') === 'reverse') {
      reverseGeocodeRequests += 1
    }

    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ label: 'Map Pick, Test State' })
    })
  })
  await page.goto('/')

  await page.locator('.aether-map').evaluate(element => {
    const bounds = element.getBoundingClientRect()

    element.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: bounds.left + 700,
      clientY: bounds.top + 350
    }))
    element.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: bounds.left + 760,
      clientY: bounds.top + 390
    }))
  })

  await expect(
    page.getByRole('region', {
      name: 'Interactive weather map for Map Pick, Test State'
    })
  ).toBeVisible()
  await expect.poll(() => reverseGeocodeRequests).toBe(2)
  await expect(page.getByRole('status')).toHaveText(/^(Live|Cached)/)
})

test('opens the map layer menu', async ({ page }) => {
  await page.goto('/')

  await page.locator('.leaflet-control-layers').hover()

  await expect(
    page.getByRole('heading', { name: 'Geological activity' })
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Satellite detections' })
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Reported incidents' })
  ).toBeVisible()
  await expect(
    page.getByRole('checkbox', { name: /Open wildfire incidents from NIFC/ })
  ).toBeVisible()
})

test('opens and closes layer information popovers', async ({ page }) => {
  await page.goto('/')
  await page.locator('.leaflet-control-layers').hover()

  const infoButton = page.getByRole('button', {
    name: 'About worldwide heat detections'
  })

  await infoButton.click()

  const popover = page.getByRole('dialog', {
    name: 'worldwide heat detections'
  })

  await expect(popover).toBeVisible()
  await expect(popover).toContainText('Satellite heat detections')
  await expect(infoButton).toHaveAttribute('aria-expanded', 'true')

  await popover.press('Escape')

  await expect(popover).toBeHidden()
  await expect(infoButton).toHaveAttribute('aria-expanded', 'false')
  await expect(infoButton).toBeFocused()
})

test('shows nearby webcams', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: /Live webcams/ }).click()

  await expect(
    page.getByRole('button', { name: /Alpine weather camera/ })
  ).toBeVisible()
  await expect(page.getByText('Test Valley · 12 km')).toBeVisible()
  await expect(page.getByText('Webcams provided by')).toBeVisible()
})

test('changes and remembers the dialog language', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Setup' }).click()
  await page.getByRole('radio', { name: 'French' }).check()

  await expect(
    page.getByRole('heading', { name: 'Réglages', exact: true })
  ).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Français' })).toBeChecked()
  await page.getByRole('button', {
    name: 'Fermer la fenêtre des réglages'
  }).click()

  await page.getByRole('button', { name: 'À propos d’Aether' }).click()
  await expect(
    page.getByRole('heading', { name: 'À propos', exact: true })
  ).toBeVisible()
  await expect(page.getByText('Sources de données')).toBeVisible()
  await expect(page.getByText('Modèles et prévisions météorologiques')).toBeVisible()

  await expect.poll(() => page.evaluate(() => (
    window.localStorage.getItem('aether:language')
  ))).toBe('fr')

  await page.reload()
  await expect(
    page.getByRole('button', { name: 'À propos d’Aether' })
  ).toBeVisible()
})

test('restores saved map overlays after reload', async ({ page }) => {
  await page.goto('/')
  await page.locator('.leaflet-control-layers').hover()

  const reportedFires = page.getByRole('checkbox', {
    name: /Open wildfire incidents from NIFC/
  })

  await reportedFires.check()
  await expect(reportedFires).toBeChecked()
  await expect.poll(() => page.evaluate(() => (
    window.localStorage.getItem('aether:map-overlays:v3')
  ))).toContain('reported-wildfires')

  await page.reload()
  await page.locator('.leaflet-control-layers').hover()

  await expect(
    page.getByRole('checkbox', { name: /Open wildfire incidents from NIFC/ })
  ).toBeChecked()
})

test('keeps wind particles moving when the map is zoomed in', async ({
  page
}) => {
  await page.goto('/')
  await selectWind(page)

  const normalZoomMovement = await measureWindMovement(page)

  for (let zoom = 0; zoom < 4; zoom += 1) {
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await page.waitForTimeout(300)
  }

  const closeZoomMovement = await measureWindMovement(page)

  expect(normalZoomMovement).toBeGreaterThan(0)
  expect(closeZoomMovement).toBeGreaterThanOrEqual(normalZoomMovement * 0.7)
  expect(closeZoomMovement).toBeLessThanOrEqual(normalZoomMovement * 6)
})

test('pauses and resumes wind animation with page visibility', async ({
  page
}) => {
  await page.goto('/')
  await selectWind(page)
  await resetAnimationProbe(page)
  await waitForWindFrames(page, 8)

  await setPageVisible(page, false)
  const hiddenFrameCount = await getWindFrameCount(page)

  await page.waitForTimeout(300)
  expect(await getWindFrameCount(page)).toBe(hiddenFrameCount)

  await setPageVisible(page, true)
  await expect.poll(() => getWindFrameCount(page)).toBeGreaterThan(
    hiddenFrameCount
  )
})

async function selectWind(page: Page) {
  const windButton = page.getByRole('button', { name: /^Wind:/ })

  await windButton.click()
  await expect(windButton).toHaveAttribute('aria-pressed', 'true')
}

async function measureWindMovement(page: Page) {
  await resetAnimationProbe(page)
  await waitForWindFrames(page, 12)

  return page.evaluate(() => {
    const probe = (window as AnimationProbeWindow).__aetherAnimationProbe
    const frames = probe.frames.filter(frame => frame.points.length >= 20)
    const distances: number[] = []

    probe.enabled = false

    for (let frameIndex = 1; frameIndex < frames.length; frameIndex += 1) {
      const previous = frames[frameIndex - 1].points
      const current = frames[frameIndex].points
      const pointCount = Math.min(previous.length, current.length)

      for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
        const distance = Math.hypot(
          current[pointIndex][0] - previous[pointIndex][0],
          current[pointIndex][1] - previous[pointIndex][1]
        )

        if (distance > 0.01 && distance < 40) {
          distances.push(distance)
        }
      }
    }

    distances.sort((left, right) => left - right)

    return distances[Math.floor(distances.length / 2)] ?? 0
  })
}

async function resetAnimationProbe(page: Page) {
  await page.evaluate(() => {
    const probe = (window as AnimationProbeWindow).__aetherAnimationProbe

    probe.frames = []
    probe.currentFrame = null
    probe.enabled = true
  })
}

async function waitForWindFrames(page: Page, count: number) {
  await expect.poll(() => getWindFrameCount(page)).toBeGreaterThanOrEqual(count)
}

async function getWindFrameCount(page: Page) {
  return page.evaluate(() => (
    (window as AnimationProbeWindow).__aetherAnimationProbe.frames.filter(
      frame => frame.points.length >= 20
    ).length
  ))
}

async function setPageVisible(page: Page, visible: boolean) {
  await page.evaluate(nextVisible => {
    (window as AnimationProbeWindow).__aetherAnimationProbe
      .setPageVisible(nextVisible)
  }, visible)
}

function buildForecast(latitude: number, longitude: number) {
  return {
    latitude,
    longitude,
    timezone: 'Europe/Paris',
    current: {
      temperature_2m: 21,
      relative_humidity_2m: 58,
      rain: 0,
      showers: 0,
      snowfall: 0,
      weather_code: 1,
      cloud_cover: 25,
      wind_speed_10m: 18,
      wind_direction_10m: 240
    },
    hourly: {
      time: Array.from(
        { length: 12 },
        (_, index) => `2026-06-29T${String(index + 9).padStart(2, '0')}:00`
      ),
      temperature_2m: Array.from({ length: 12 }, (_, index) => 21 + index / 4),
      precipitation: Array.from({ length: 12 }, () => 0),
      snowfall: Array.from({ length: 12 }, () => 0),
      weather_code: Array.from({ length: 12 }, () => 1),
      cloud_cover: Array.from({ length: 12 }, () => 25),
      wind_speed_10m: Array.from({ length: 12 }, () => 18),
      wind_direction_10m: Array.from({ length: 12 }, () => 240)
    },
    daily: {
      time: ['2026-06-29'],
      temperature_2m_max: [26],
      temperature_2m_min: [17],
      apparent_temperature_max: [27],
      sunrise: ['2026-06-29T05:52'],
      sunset: ['2026-06-29T21:42']
    }
  }
}
