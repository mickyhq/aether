import type { WeatherMapSample, WeatherMode } from '../types/weather'

export function renderWeatherBadge(
  sample: WeatherMapSample,
  mode: WeatherMode,
  stormLabel: string
) {
  const estimate = sample.estimated ? '~' : ''

  return `
    <div class="weather-map-badge">
      <span class="weather-map-badge-place">${escapeHtml(sample.label)}</span>
      <span class="weather-map-badge-value">${estimate}${escapeHtml(formatMetric(sample, mode, stormLabel))}</span>
    </div>
  `
}

function formatMetric(
  sample: WeatherMapSample,
  mode: WeatherMode,
  stormLabel: string
) {
  if (mode === 'temperature') return `${Math.round(sample.temperature)}°C`
  if (mode === 'wind') return `${Math.round(sample.rawWindSpeed)} km/h`
  if (mode === 'jet-stream') return '--'
  if (mode === 'precipitation') {
    const amount = `${sample.precipitation.toFixed(1)} mm`

    return sample.isThunderstorm ? `${stormLabel} · ${amount}` : amount
  }

  return '--'
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
