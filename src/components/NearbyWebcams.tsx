import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import VideocamIcon from '@mui/icons-material/Videocam'
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  Typography
} from '@mui/material'
import { useEffect, useState } from 'react'
import { fetchNearbyWebcams } from '../services/webcams'
import type { NearbyWebcam, NearbyWebcams, WeatherLocation } from '../types/weather'
import { usePageVisibility } from '../hooks/usePageVisibility'

export function NearbyWebcams({ location }: { location: WeatherLocation | null }) {
  const [expanded, setExpanded] = useState(false)
  const [result, setResult] = useState<NearbyWebcams | null>(null)
  const [selected, setSelected] = useState<NearbyWebcam | null>(null)
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const pageVisible = usePageVisibility()

  useEffect(() => {
    setExpanded(false)
    setResult(null)
    setSelected(null)
    setUnavailable(false)
  }, [location])

  useEffect(() => {
    if (!pageVisible || !expanded || !location || result || unavailable) return

    const controller = new AbortController()

    setLoading(true)
    void fetchNearbyWebcams(location, controller.signal)
      .then(setResult)
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setUnavailable(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [expanded, location, pageVisible, result, unavailable])

  if (!location) return null

  return (
    <Box className={`nearby-webcams ${expanded ? 'is-expanded' : ''}`}>
      <button
        className="nearby-webcams-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded(current => !current)}
      >
        <VideocamIcon />
        <span>
          <strong>Live webcams</strong>
          <small>Visually check nearby weather</small>
        </span>
        <ExpandMoreIcon className="nearby-webcams-expand" />
      </button>

      {expanded && (
        <Box className="nearby-webcams-content">
          {loading && <Typography variant="caption">Finding nearby cameras…</Typography>}
          {unavailable && <Typography variant="caption">Webcams unavailable</Typography>}
          {result?.configured === false && (
            <Typography variant="caption">
              Add WINDY_KEY on the server to enable cameras.
            </Typography>
          )}
          {result?.configured && result.webcams.length === 0 && (
            <Typography variant="caption">
              No public webcams within {result.radiusKm} km.
            </Typography>
          )}
          {result?.webcams.map(webcam => (
            <button
              className="nearby-webcam-item"
              key={webcam.id}
              onClick={() => setSelected(webcam)}
            >
              <VideocamIcon />
              <span>
                <strong>{webcam.title}</strong>
                <small>{webcam.city} · {webcam.distanceKm} km</small>
              </span>
              <span className="nearby-webcam-live">
                {webcam.live ? 'Live' : 'Today'}
              </span>
            </button>
          ))}
          {result?.configured && <WindyAttribution />}
        </Box>
      )}

      <WebcamDialog webcam={selected} onClose={() => setSelected(null)} />
    </Box>
  )
}

function WebcamDialog({
  webcam,
  onClose
}: {
  webcam: NearbyWebcam | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={Boolean(webcam)}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{ paper: { className: 'webcam-dialog-paper' } }}
    >
      {webcam && (
        <>
          <DialogTitle className="webcam-dialog-title">
            <Box>
              <Typography component="h2">{webcam.title}</Typography>
              <Typography variant="caption">
                {webcam.city} · {webcam.distanceKm} km away
              </Typography>
            </Box>
            <IconButton aria-label="Close webcam" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent className="webcam-dialog-content">
            <iframe
              className="webcam-player"
              src={webcam.playerUrl}
              title={`Live webcam: ${webcam.title}`}
              allow="autoplay; fullscreen"
              referrerPolicy="no-referrer"
            />
            <Box className="webcam-dialog-footer">
              <WindyAttribution />
              <Link href={webcam.detailUrl} target="_blank" rel="noreferrer">
                Open on Windy <OpenInNewIcon />
              </Link>
            </Box>
          </DialogContent>
        </>
      )}
    </Dialog>
  )
}

function WindyAttribution() {
  return (
    <Typography variant="caption" className="windy-attribution">
      Webcams provided by{' '}
      <Link href="https://www.windy.com/" target="_blank" rel="noreferrer">
        windy.com
      </Link>
      {' · '}
      <Link href="https://www.windy.com/webcams/add" target="_blank" rel="noreferrer">
        add new webcam
      </Link>
    </Typography>
  )
}
