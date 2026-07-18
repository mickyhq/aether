import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { MapWeatherTooltip } from '../../src/components/MapWeatherTooltip'
import { I18nProvider } from '../../src/i18n/I18nContext'
import type { MapWeatherPointer } from '../../src/types/weather'

describe('map detail regressions', () => {
  test('shows pressure, particulate matter, and snowfall details together', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <MapWeatherTooltip reading={buildReading()} onClose={() => {}} />
      </I18nProvider>
    )

    expect(markup).toContain('Air quality index · 42')
    expect(markup).toContain('Fine particles (PM2.5) · 8.4 µg/m³')
    expect(markup).toContain('Particles (PM10) · 14.2 µg/m³')
    expect(markup).toContain('MSL pressure · 998 hPa')
    expect(markup).toContain('Snow 1.3 cm')
  })
})

function buildReading(): MapWeatherPointer {
  return {
    screenX: 100,
    screenY: 100,
    latitude: 46.2,
    longitude: 7.1,
    temperature: -2,
    precipitation: 1.1,
    pressureMsl: 998,
    snowfall: 1.3,
    rawWindSpeed: 12,
    windAngle: 0,
    cloudOpacity: 1,
    isThunderstorm: false,
    europeanAqi: 42,
    pm2_5: 8.4,
    pm10: 14.2
  }
}
