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
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { SourceLogo } from './SourceLogo'

const DATA_SOURCES: Array<{
  name: string
  kind: TranslationKey
  url: string
}> = [
  {
    name: 'Open-Meteo',
    kind: 'source.weather',
    url: 'https://open-meteo.com/'
  },
  {
    name: 'ECMWF',
    kind: 'source.ifs',
    url: 'https://www.ecmwf.int/'
  },
  {
    name: 'Copernicus CAMS',
    kind: 'source.airQuality',
    url: 'https://atmosphere.copernicus.eu/'
  },
  {
    name: 'NOAA CoastWatch',
    kind: 'source.oceanCurrents',
    url: 'https://coastwatch.noaa.gov/'
  },
  {
    name: 'NOAA OISST',
    kind: 'source.seaTemperature',
    url: 'https://www.ncei.noaa.gov/products/optimum-interpolation-sst'
  },
  {
    name: 'NOAA CPC',
    kind: 'source.enso',
    url: 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/'
  },
  {
    name: 'RainViewer',
    kind: 'source.radar',
    url: 'https://www.rainviewer.com/api.html'
  },
  {
    name: 'OpenFreeMap / OpenMapTiles',
    kind: 'source.mapRendering',
    url: 'https://openfreemap.org/'
  },
  {
    name: 'OpenStreetMap',
    kind: 'source.mapData',
    url: 'https://www.openstreetmap.org/copyright'
  },
  {
    name: 'US National Weather Service',
    kind: 'source.officialWarnings',
    url: 'https://www.weather.gov/'
  },
  {
    name: 'MeteoAlarm',
    kind: 'source.officialWarnings',
    url: 'https://www.meteoalarm.org/'
  },
  {
    name: 'NASA FIRMS',
    kind: 'source.worldHeat',
    url: 'https://firms.modaps.eosdis.nasa.gov/'
  },
  {
    name: 'NIFC WFIGS',
    kind: 'source.usFires',
    url: 'https://www.nifc.gov/'
  },
  {
    name: 'NRCan CWFIS',
    kind: 'source.canadaFires',
    url: 'https://cwfis.cfs.nrcan.gc.ca/en/'
  },
  {
    name: 'NASA EONET',
    kind: 'source.reportedFires',
    url: 'https://eonet.gsfc.nasa.gov/'
  },
  {
    name: 'Copernicus EFFIS',
    kind: 'source.europeAfricaFires',
    url: 'https://forest-fire.emergency.copernicus.eu/'
  },
  {
    name: 'Smithsonian GVP / USGS',
    kind: 'source.volcanoes',
    url: 'https://volcano.si.edu/reports_weekly.cfm'
  },
  {
    name: 'Windy Webcams',
    kind: 'source.webcams',
    url: 'https://www.windy.com/webcams'
  },
  {
    name: '7Timer Astro',
    kind: 'source.astronomy',
    url: 'https://www.7timer.info/'
  },
  {
    name: 'World Atlas',
    kind: 'source.nightSky',
    url: 'https://doi.org/10.1126/sciadv.1600377'
  }
]

export function AboutDialog() {
  const [open, setOpen] = useState(false)
  const { t } = useI18n()

  return (
    <>
      <Tooltip title={t('about.tooltip')}>
        <IconButton
          className="about-button"
          aria-label={t('about.tooltip')}
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
              {t('about.title')}
            </Typography>
          </Box>
          <IconButton aria-label={t('about.close')} onClick={() => setOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers className="about-dialog-content">
          <Box component="section" className="about-author">
            <Typography component="h3" className="about-section-title">
              {t('about.author')}
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
              {t('about.dataSources')}
            </Typography>
            <Box component="ul" className="about-source-list">
              {DATA_SOURCES.map(source => (
                <Box component="li" className="about-source-item" key={source.name}>
                  <SourceLogo name={source.name} url={source.url} />
                  <Box className="about-source-copy">
                    <Link href={source.url} target="_blank" rel="noreferrer">
                      {source.name}
                    </Link>
                    <Typography component="span">{t(source.kind)}</Typography>
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
