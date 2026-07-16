import type { FireLayerStatus as FireLayerStatusValue } from '../map/fireLayerStatus'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'

type FireLayerStatusProps = {
  statuses: FireLayerStatusValue[]
}

const STATE_LABELS: Record<FireLayerStatusValue['state'], TranslationKey> = {
  idle: 'fire.off',
  loading: 'common.loading',
  available: 'fire.ready',
  unavailable: 'common.unavailable',
  'missing-key': 'fire.keyMissing'
}
const LAYER_LABELS: Record<FireLayerStatusValue['id'], TranslationKey> = {
  'heat-detections': 'fire.worldwideLayer',
  'reported-wildfires': 'fire.reportedLayer',
  'africa-detections': 'fire.africaLayer',
  'europe-detections': 'fire.europeLayer'
}

export function FireLayerStatus({ statuses }: FireLayerStatusProps) {
  const { t } = useI18n()
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
      aria-label={t('fire.statusAria')}
      aria-live="polite"
    >
      {enabledStatuses.map(status => (
        <div className="fire-layer-status-row" key={status.id}>
          <span className="fire-layer-status-name">{t(LAYER_LABELS[status.id])}</span>
          <span
            className={`fire-layer-status-state is-${status.state}`}
          >
            {t(STATE_LABELS[status.state])}
          </span>
          {(status.lastUpdated || typeof status.itemCount === 'number') && (
            <span className="fire-layer-status-detail">
              {typeof status.itemCount === 'number'
                ? t('fire.reports', { count: status.itemCount.toLocaleString() })
                : ''}
              {status.lastUpdated
                ? t('fire.loaded', { time: formatTime(status.lastUpdated) })
                : t('fire.notLoaded')}
            </span>
          )}
        </div>
      ))}
      {detectionStatus && (
        <section
          className="effis-fire-legend"
          aria-label={t('fire.legendAria')}
        >
          <strong>{t(formatLegendTitle(hasEffis, hasFirms))}</strong>
          <div className="effis-fire-legend-ages">
            <span><i className="is-six-hours" />{t('fire.sixHours')}</span>
            <span><i className="is-twelve-hours" />{t('fire.twelveHours')}</span>
            <span><i className="is-day" />{t('fire.day')}</span>
            {hasEffis && (
              <span><i className="is-older" />{t('fire.older')}</span>
            )}
          </div>
          {hasEffis && (
            <span className="effis-fire-legend-satellites">
              ■ Suomi · ● NOAA-20 · ◆ NOAA-21
            </span>
          )}
          <span className="effis-fire-legend-time">
            {formatSourceWindow(hasEffis, hasFirms, t)}
            {detectionStatus.lastUpdated
              ? ` · ${t('fire.tilesLoaded', { time: formatTime(detectionStatus.lastUpdated) })}`
              : ''}
          </span>
        </section>
      )}
    </aside>
  )
}

function formatLegendTitle(hasEffis: boolean, hasFirms: boolean): TranslationKey {
  if (hasEffis && hasFirms) {
    return 'fire.legendTitle'
  }

  return hasFirms ? 'fire.firmsLegendTitle' : 'fire.effisLegendTitle'
}

function formatSourceWindow(
  hasEffis: boolean,
  hasFirms: boolean,
  t: ReturnType<typeof useI18n>['t']
) {
  if (hasEffis && hasFirms) {
    return t('fire.combinedWindow', { window: formatEffisWindow() })
  }

  return hasFirms
    ? t('fire.worldwideWindow')
    : t('fire.effisWindow', { window: formatEffisWindow() })
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
