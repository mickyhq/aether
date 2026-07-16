export type WarningProvider = 'nws' | 'meteoalarm'

export type WarningHazard =
  'storm' |
  'flood' |
  'wind' |
  'snow' |
  'fire-weather' |
  'extreme-temperature' |
  'air-quality' |
  'other'

export type WarningSeverity =
  'unknown' | 'minor' | 'moderate' | 'severe' | 'extreme'

export type WarningCertainty =
  'unknown' | 'unlikely' | 'possible' | 'likely' | 'observed'

export type WarningGeometry = {
  type: 'Polygon' | 'MultiPolygon'
  coordinates: unknown[]
}

export type OfficialWarning = {
  id: string
  provider: WarningProvider
  hazard: WarningHazard
  title: string
  description: string
  severity: WarningSeverity
  certainty: WarningCertainty
  effectiveAt: string | null
  expiresAt: string | null
  updatedAt: string | null
  instructions: string | null
  area: string | null
  source: string
  sourceUrl: string | null
  geometry: WarningGeometry | null
  state: 'active' | 'grace'
  references: string[]
}

export type WarningProviderStatus = {
  id: WarningProvider
  source: string
  status: 'available' | 'unconfigured' | 'not-applicable'
}

export type OfficialWarningsRecord = {
  generatedAt: string
  warnings: OfficialWarning[]
  providers: WarningProviderStatus[]
}
