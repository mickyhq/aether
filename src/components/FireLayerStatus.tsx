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
  const effisStatuses = enabledStatuses.filter(status => (
    status.id === 'europe-detections' || status.id === 'africa-detections'
  ))
  const firmsStatus = enabledStatuses.find(status => status.id === 'heat-detections')
  const detectionStatuses = [firmsStatus, ...effisStatuses].filter(
    (status): status is FireLayerStatusValue => Boolean(status)
  )
  const detectionStatus = detectionStatuses.find(status => status.lastUpdated) ??
    detectionStatuses[0]
  const hasEffis = effisStatuses.length > 0
  const hasFirms = Boolean(firmsStatus)

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
      {detectionStatus && (
        <section
          className="effis-fire-legend"
          aria-label="VIIRS detection age legend"
        >
          <strong>{formatLegendTitle(hasEffis, hasFirms)}</strong>
          <div className="effis-fire-legend-ages">
            <span><i className="is-six-hours" />≤ 6 hours</span>
            <span><i className="is-twelve-hours" />6–12 hours</span>
            <span><i className="is-day" />12–24 hours</span>
            {hasEffis && (
              <span><i className="is-older" />Older · yesterday</span>
            )}
          </div>
          {hasEffis && (
            <span className="effis-fire-legend-satellites">
              ■ Suomi · ● NOAA-20 · ◆ NOAA-21
            </span>
          )}
          <span className="effis-fire-legend-time">
            {formatSourceWindow(hasEffis, hasFirms)}
            {detectionStatus.lastUpdated
              ? ` · Tiles loaded ${formatTime(detectionStatus.lastUpdated)}`
              : ''}
          </span>
        </section>
      )}
    </aside>
  )
}

function formatLegendTitle(hasEffis: boolean, hasFirms: boolean) {
  if (hasEffis && hasFirms) {
    return 'VIIRS detection age'
  }

  return hasFirms ? 'NASA FIRMS VIIRS detection age' : 'EFFIS VIIRS detection age'
}

function formatSourceWindow(hasEffis: boolean, hasFirms: boolean) {
  if (hasEffis && hasFirms) {
    return `Source windows UTC: Worldwide last 24h · EFFIS ${formatEffisWindow()}`
  }

  return hasFirms
    ? 'Source window UTC: Worldwide last 24 hours'
    : `Source window UTC: ${formatEffisWindow()}`
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  }).format(timestamp)
}

function formatEffisWindow() {
  const today = new Date()
  const yesterday = new Date(today)

  yesterday.setUTCDate(yesterday.getUTCDate() - 1)

  return `${formatUtcDate(yesterday)}–${formatUtcDate(today)}`
}

function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10)
}
