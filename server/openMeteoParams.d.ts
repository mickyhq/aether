export type OpenMeteoParameterConfig = {
  currentFields: Set<string>
  hourlyFields?: Set<string>
  maxForecastDays?: number
}

export const WEATHER_PARAMETER_CONFIG: OpenMeteoParameterConfig
export const AIR_QUALITY_PARAMETER_CONFIG: OpenMeteoParameterConfig

export function buildCanonicalOpenMeteoParams(
  input: URLSearchParams,
  config: OpenMeteoParameterConfig
): {
  params?: URLSearchParams
  error?: string
}
