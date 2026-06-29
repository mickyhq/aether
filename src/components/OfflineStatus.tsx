import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined'
import { useEffect, useState } from 'react'

export function OfflineStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

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
      Offline · showing saved weather
    </div>
  )
}
