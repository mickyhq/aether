export const WIND_COLORS = [
  '#70d6ff',
  '#4ee0bd',
  '#9be564',
  '#f4e65e',
  '#ffb347',
  '#ff6b5e',
  '#d967ff'
]

export const JET_STREAM_COLORS = [
  '#6ce5ff',
  '#62b8ff',
  '#7785ff',
  '#a46cff',
  '#e66cff',
  '#ff83c8',
  '#fff4ff'
]

export const JET_STREAM_OUTLINE_COLORS = [
  '#39d5ff',
  '#85f08f',
  '#ffb454',
  '#ff62c7'
]

export const JET_STREAM_NAMES = [
  'N polar',
  'N subtropical',
  'S subtropical',
  'S polar'
]

export const OCEAN_TEMPERATURE_COLORS = [
  '#5546d8',
  '#2676ed',
  '#21c5e8',
  '#35d49a',
  '#e2db48',
  '#ff9838',
  '#f13d5e'
]

export const OCEAN_TEMPERATURE_STOPS = [-2, 4, 10, 16, 22, 28, 34]

export function airQualityColor(airQuality: number) {
  return interpolateColor(airQuality, [
    { value: 0, r: 50, g: 205, b: 115 },
    { value: 20, r: 105, g: 220, b: 105 },
    { value: 40, r: 245, g: 220, b: 70 },
    { value: 60, r: 255, g: 155, b: 55 },
    { value: 80, r: 245, g: 75, b: 70 },
    { value: 100, r: 150, g: 45, b: 155 }
  ])
}

export function temperatureColor(temperature: number) {
  return interpolateColor(temperature, [
    { value: -15, r: 82, g: 35, b: 150 },
    { value: -5, r: 25, g: 85, b: 220 },
    { value: 5, r: 30, g: 205, b: 245 },
    { value: 15, r: 75, g: 225, b: 125 },
    { value: 25, r: 255, g: 220, b: 55 },
    { value: 35, r: 255, g: 100, b: 35 },
    { value: 45, r: 220, g: 20, b: 100 }
  ])
}

export function temperatureAnomalyColor(anomaly: number) {
  return interpolateColor(anomaly, [
    { value: -10, r: 32, g: 82, b: 190 },
    { value: -5, r: 83, g: 154, b: 230 },
    { value: 0, r: 241, g: 244, b: 238 },
    { value: 5, r: 239, g: 127, b: 78 },
    { value: 10, r: 172, g: 30, b: 69 }
  ])
}

export function precipitationForecastStyle(precipitation: number) {
  if (precipitation < 0.08) {
    return { r: 0, g: 0, b: 0, alpha: 0 }
  }

  if (precipitation < 0.3) {
    return { r: 82, g: 151, b: 255, alpha: 132 }
  }

  if (precipitation < 1) {
    return { r: 41, g: 205, b: 255, alpha: 168 }
  }

  if (precipitation < 2.5) {
    return { r: 45, g: 220, b: 133, alpha: 190 }
  }

  if (precipitation < 5) {
    return { r: 238, g: 220, b: 62, alpha: 210 }
  }

  if (precipitation < 10) {
    return { r: 255, g: 139, b: 49, alpha: 224 }
  }

  if (precipitation < 20) {
    return { r: 255, g: 73, b: 83, alpha: 236 }
  }

  return { r: 211, g: 70, b: 255, alpha: 244 }
}

type ColorStop = {
  value: number
  r: number
  g: number
  b: number
}

function interpolateColor(value: number, stops: ColorStop[]) {
  const upperIndex = stops.findIndex(stop => stop.value >= value)
  const upper = stops[
    upperIndex === -1 ? stops.length - 1 : Math.max(upperIndex, 1)
  ]
  const lower = stops[
    upperIndex === -1 ? stops.length - 2 : Math.max(upperIndex - 1, 0)
  ]
  const amount = Math.min(
    1,
    Math.max(0, (value - lower.value) / (upper.value - lower.value))
  )

  return {
    r: Math.round(lower.r + (upper.r - lower.r) * amount),
    g: Math.round(lower.g + (upper.g - lower.g) * amount),
    b: Math.round(lower.b + (upper.b - lower.b) * amount)
  }
}
