export type FireLayerId =
  | 'heat-detections'
  | 'reported-wildfires'
  | 'europe-detections'

export type FireLayerState =
  | 'idle'
  | 'loading'
  | 'available'
  | 'unavailable'
  | 'missing-key'

export type FireLayerStatus = {
  id: FireLayerId
  label: string
  enabled: boolean
  state: FireLayerState
  lastUpdated: number | null
  itemCount?: number
}

export type FireLayerStatusPatch = Partial<
  Pick<FireLayerStatus, 'enabled' | 'state' | 'lastUpdated' | 'itemCount'>
>

export const INITIAL_FIRE_LAYER_STATUSES: FireLayerStatus[] = [
  {
    id: 'heat-detections',
    label: 'Americas heat detections · 24h',
    enabled: false,
    state: 'idle',
    lastUpdated: null
  },
  {
    id: 'reported-wildfires',
    label: 'Reported open wildfires',
    enabled: false,
    state: 'idle',
    lastUpdated: null
  },
  {
    id: 'europe-detections',
    label: 'Europe fire detections · Today + yesterday',
    enabled: false,
    state: 'idle',
    lastUpdated: null
  }
]
