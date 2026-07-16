import { Alert, AlertTitle, Link, Stack, Typography } from '@mui/material'
import type { OfficialWarning } from '../types/weather'
import { useI18n } from '../i18n/I18nContext'

type OfficialWarningAlertProps = {
  warning: OfficialWarning
  onClose: () => void
}

export function OfficialWarningAlert({
  warning,
  onClose
}: OfficialWarningAlertProps) {
  const { language, t } = useI18n()
  const severity = warning.severity === 'extreme' || warning.severity === 'severe'
    ? 'error'
    : warning.severity === 'moderate' ? 'warning' : 'info'

  return (
    <Alert
      severity={severity}
      variant="outlined"
      className={`severe-weather-alert official-warning-alert ${warning.state === 'grace' ? 'is-grace' : ''}`}
      onClose={onClose}
    >
      <AlertTitle>{warning.title}</AlertTitle>
      <Stack spacing={0.45}>
        <Typography className="official-warning-description">
          {warning.description}
        </Typography>
        <Typography className="official-warning-meta">
          {t('warning.hazard', { value: warning.hazard })}
          {' · '}
          {t('warning.severity', { value: warning.severity })}
          {' · '}
          {t('warning.certainty', { value: warning.certainty })}
        </Typography>
        {warning.area && (
          <Typography className="official-warning-meta">
            {t('warning.area', { value: warning.area })}
          </Typography>
        )}
        <Typography className="official-warning-meta">
          {formatWindow(warning, language, t)}
        </Typography>
        {warning.updatedAt && (
          <Typography className="official-warning-meta">
            {t('warning.updated', { age: formatAge(warning.updatedAt, t) })}
          </Typography>
        )}
        {warning.instructions && (
          <Typography className="official-warning-instructions">
            {t('warning.instructions', { value: warning.instructions })}
          </Typography>
        )}
        {warning.state === 'grace' && (
          <Typography className="official-warning-grace">
            {t('warning.grace')}
          </Typography>
        )}
        <Typography className="official-warning-source">
          {t('warning.source', { source: warning.source })}
          {warning.sourceUrl && (
            <>
              {' · '}
              <Link href={warning.sourceUrl} target="_blank" rel="noreferrer">
                {t('warning.openSource')}
              </Link>
            </>
          )}
        </Typography>
      </Stack>
    </Alert>
  )
}

function formatWindow(
  warning: OfficialWarning,
  language: string,
  t: ReturnType<typeof useI18n>['t']
) {
  const effective = formatDate(warning.effectiveAt, language)
  const expires = formatDate(warning.expiresAt, language)

  if (effective && expires) {
    return t('warning.window', { effective, expires })
  }

  if (expires) {
    return t('warning.expires', { value: expires })
  }

  return effective ? t('warning.effective', { value: effective }) : ''
}

function formatDate(value: string | null, language: string) {
  if (!value) {
    return null
  }

  return new Intl.DateTimeFormat(language, {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value))
}

function formatAge(
  value: string,
  t: ReturnType<typeof useI18n>['t']
) {
  const ageMinutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000))

  if (ageMinutes < 1) {
    return t('data.ageNow')
  }

  if (ageMinutes < 60) {
    return t('data.ageMinutes', { count: ageMinutes })
  }

  const hours = Math.floor(ageMinutes / 60)

  return hours < 24
    ? t('data.ageHours', { count: hours })
    : t('data.ageDays', { count: Math.floor(hours / 24) })
}
