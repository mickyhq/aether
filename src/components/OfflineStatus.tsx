import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined'
import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/I18nContext'

export function OfflineStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const { t } = useI18n()

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (isOnline) {
    return null
  }

  return (
    <div className="offline-status" role="status" aria-live="polite">
      <CloudOffOutlinedIcon aria-hidden="true" />
      {t('offline.saved')}
    </div>
  )
}
