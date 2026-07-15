import CloseIcon from '@mui/icons-material/Close'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  Tooltip,
  Typography
} from '@mui/material'
import { useState } from 'react'
import { SourceLogo } from './SourceLogo'

const DATA_SOURCES = [
  {
    name: 'Open-Meteo',
    kind: 'Weather models and forecasts',
    url: 'https://open-meteo.com/'
  },
  {
    name: 'ECMWF',
    kind: 'IFS forecast model',
    url: 'https://www.ecmwf.int/'
  },
  {
    name: 'Copernicus CAMS',
    kind: 'Air quality',
    url: 'https://atmosphere.copernicus.eu/'
  },
  {
    name: 'NOAA CoastWatch',
    kind: 'Ocean currents',
    url: 'https://coastwatch.noaa.gov/'
  },
  {
    name: 'NOAA OISST',
    kind: 'Sea-surface temperature',
    url: 'https://www.ncei.noaa.gov/products/optimum-interpolation-sst'
  },
  {
    name: 'NOAA CPC',
    kind: 'El Niño and La Niña RONI',
    url: 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/'
  },
  {
    name: 'RainViewer',
    kind: 'Precipitation radar',
    url: 'https://www.rainviewer.com/api.html'
  },
  {
    name: 'OpenStreetMap',
    kind: 'Map and geocoding',
    url: 'https://www.openstreetmap.org/copyright'
  },
  {
    name: 'MeteoGate',
    kind: 'Official heat warnings',
    url: 'https://meteogate.eu/'
  },
  {
    name: 'NASA FIRMS',
    kind: 'Worldwide heat detections',
    url: 'https://firms.modaps.eosdis.nasa.gov/'
  },
  {
    name: 'NIFC WFIGS',
    kind: 'United States fire incidents',
    url: 'https://www.nifc.gov/'
  },
  {
    name: 'NRCan CWFIS',
    kind: 'Canadian fire incidents',
    url: 'https://cwfis.cfs.nrcan.gc.ca/en/'
  },
  {
    name: 'NASA EONET',
    kind: 'Reported wildfire events',
    url: 'https://eonet.gsfc.nasa.gov/'
  },
  {
    name: 'Copernicus EFFIS',
    kind: 'Europe and Africa fire detections',
    url: 'https://forest-fire.emergency.copernicus.eu/'
  },
  {
    name: 'Smithsonian GVP / USGS',
    kind: 'Worldwide weekly volcano activity',
    url: 'https://volcano.si.edu/reports_weekly.cfm'
  },
  {
    name: 'Windy Webcams',
    kind: 'Nearby public webcams',
    url: 'https://www.windy.com/webcams'
  }
]

export function AboutDialog() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Tooltip title="About Aether">
        <IconButton
          className="about-button"
          aria-label="About Aether"
          onClick={() => setOpen(true)}
        >
          <InfoOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        aria-labelledby="about-dialog-title"
        maxWidth="md"
        fullWidth
        slotProps={{ paper: { className: 'about-dialog-paper' } }}
      >
        <DialogTitle id="about-dialog-title" className="about-dialog-title">
          <Box>
            <Typography component="span" className="about-dialog-eyebrow">
              Aether
            </Typography>
            <Typography component="h2" variant="h5">
              About
            </Typography>
          </Box>
          <IconButton aria-label="Close about dialog" onClick={() => setOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers className="about-dialog-content">
          <Box component="section" className="about-author">
            <Typography component="h3" className="about-section-title">
              Author
            </Typography>
            <Link
              href="https://github.com/MickyBalladelli/aether"
              target="_blank"
              rel="noreferrer"
            >
              Micky Balladelli
            </Link>
          </Box>
          <Box component="section">
            <Typography component="h3" className="about-section-title">
              Data sources
            </Typography>
            <Box component="ul" className="about-source-list">
              {DATA_SOURCES.map(source => (
                <Box component="li" className="about-source-item" key={source.name}>
                  <SourceLogo name={source.name} url={source.url} />
                  <Box className="about-source-copy">
                    <Link href={source.url} target="_blank" rel="noreferrer">
                      {source.name}
                    </Link>
                    <Typography component="span">{source.kind}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  )
}
