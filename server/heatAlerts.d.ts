export type OfficialHeatAlert = {
  id: string
  title: string
  message: string
  severity: 'warning' | 'error'
  source: string
}

export function parseHeatAlertCoordinates(
  latitude: unknown,
  longitude: unknown
): {
  latitude: number
  longitude: number
} | null

export function getOfficialHeatAlerts(
  latitude: number,
  longitude: number
): Promise<OfficialHeatAlert[]>
