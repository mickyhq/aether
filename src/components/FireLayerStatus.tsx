import type { FireLayerStatus as FireLayerStatusValue } from '../map/fireLayerStatus'

type FireLayerStatusProps = {
  statuses: FireLayerStatusValue[]
}

const STATE_LABELS: Record<FireLayerStatusValue['state'], string> = {
  idle: 'Off',
  loading: 'Loading…',
  available: 'Ready',
  unavailable: 'Unavailable',
  'missing-key': 'NASA key missing'
}

export function FireLayerStatus({ statuses }: FireLayerStatusProps) {
  const enabledStatuses = statuses.filter(status => status.enabled)

  if (enabledStatuses.length === 0) {
    return null
  }

  return (
    <aside
      className="fire-layer-status"
      aria-label="Fire layer status"
      aria-live="polite"
    >
      {enabledStatuses.map(status => (
        <div className="fire-layer-status-row" key={status.id}>
          <span className="fire-layer-status-name">{status.label}</span>
          <span
            className={`fire-layer-status-state is-${status.state}`}
          >
            {STATE_LABELS[status.state]}
          </span>
          {(status.lastUpdated || typeof status.itemCount === 'number') && (
            <span className="fire-layer-status-detail">
              {typeof status.itemCount === 'number'
                ? `${status.itemCount.toLocaleString()} reports · `
                : ''}
              {status.lastUpdated
                ? `Loaded ${formatTime(status.lastUpdated)}`
                : 'Not loaded yet'}
            </span>
          )}
        </div>
      ))}
    </aside>
  )
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  }).format(timestamp)
}
