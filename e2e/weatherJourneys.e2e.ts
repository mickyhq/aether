import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/weather?**', async route => {
    const url = new URL(route.request().url())
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

  await page.route('**/api/heat-alerts?**', route => (
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ alerts: [] })
    })
  ))
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
})

test('searches for a location and loads its forecast', async ({ page }) => {
  await page.route('https://geocoding-api.open-meteo.com/**', route => (
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        results: [{
          name: 'Lyon',
          admin1: 'Auvergne-Rhône-Alpes',
          country: 'France',
          latitude: 45.764,
          longitude: 4.8357
        }]
      })
    })
  ))
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

test('selects a location from the map', async ({ page }) => {
  let reverseGeocodeRequests = 0

  await page.route('https://nominatim.openstreetmap.org/**', route => {
    reverseGeocodeRequests += 1

    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        address: {
          city: 'Map Pick',
          state: 'Test State'
        }
      })
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
  expect(reverseGeocodeRequests).toBe(1)
  await expect(page.getByRole('status')).toHaveText(/^(Live|Cached)$/)
})

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
