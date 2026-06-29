import type { OpenMeteoResponse } from '../src/types/weather'

export type EcmwfProviderResponse = OpenMeteoResponse & {
  model: string
}

export function fetchEcmwfForecast(
  latitude: number,
  longitude: number,
  forecastHours?: number
): Promise<EcmwfProviderResponse>
