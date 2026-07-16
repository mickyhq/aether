import type { WeatherMapSample, WeatherMode } from '../types/weather'

export function renderWeatherBadge(
  sample: WeatherMapSample,
  mode: WeatherMode,
  stormLabels: { storm: string, noStorm: string }
) {
  const estimate = sample.estimated ? '~' : ''

  return `
    <div class="weather-map-badge">
      <span class="weather-map-badge-place">${escapeHtml(sample.label)}</span>
      <span class="weather-map-badge-value">${estimate}${escapeHtml(formatMetric(sample, mode, stormLabels))}</span>
    </div>
  `
}

function formatMetric(
  sample: WeatherMapSample,
  mode: WeatherMode,
  stormLabels: { storm: string, noStorm: string }
) {
  if (mode === 'temperature') return `${Math.round(sample.temperature)}°C`
  if (mode === 'wind') return `${Math.round(sample.rawWindSpeed)} km/h`
  if (mode === 'jet-stream') return '--'
  if (mode === 'precipitation') return `${sample.precipitation.toFixed(1)} mm`

  return sample.isThunderstorm ? stormLabels.storm : stormLabels.noStorm
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
