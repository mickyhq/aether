export const THUNDERSTORM_CODES = new Set([95, 96, 99])

import type { TranslationKey } from '../i18n/translations'

type WeatherTranslationKey = Extract<TranslationKey, `weather.${string}`>

export function getWeatherCodeTranslationKey(code: number): WeatherTranslationKey {
  if (THUNDERSTORM_CODES.has(code)) {
    return 'weather.thunderstorm'
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return 'weather.snow'
  }

  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return 'weather.rain'
  }

  if ([45, 48].includes(code)) {
    return 'weather.fog'
  }

  if ([1, 2, 3].includes(code)) {
    return 'weather.cloudDrift'
  }

  return 'weather.clearAir'
}

export function describeWeatherCode(code: number) {
  const descriptions: Record<WeatherTranslationKey, string> = {
    'weather.thunderstorm': 'Thunderstorm',
    'weather.snow': 'Snow',
    'weather.rain': 'Rain',
    'weather.fog': 'Fog',
    'weather.cloudDrift': 'Cloud drift',
    'weather.clearAir': 'Clear air'
  }

  return descriptions[getWeatherCodeTranslationKey(code)]
}
