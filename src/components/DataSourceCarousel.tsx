const DATA_SOURCES = [
  {
    name: 'Open-Meteo',
    kind: 'Weather',
    url: 'https://open-meteo.com/'
  },
  {
    name: 'ECMWF',
    kind: 'Forecast',
    url: 'https://www.ecmwf.int/'
  },
  {
    name: 'Copernicus CAMS',
    kind: 'Air quality',
    url: 'https://atmosphere.copernicus.eu/'
  },
  {
    name: 'NOAA CoastWatch',
    kind: 'Ocean currents + SST',
    url: 'https://coastwatch.noaa.gov/'
  },
  {
    name: 'NOAA CPC',
    kind: 'El Niño / La Niña · RONI',
    url: 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/'
  },
  {
    name: 'RainViewer',
    kind: 'Radar',
    url: 'https://www.rainviewer.com/api.html'
  },
  {
    name: 'OpenStreetMap',
    kind: 'Map',
    url: 'https://www.openstreetmap.org/copyright'
  },
  {
    name: 'CARTO',
    kind: 'Dark map',
    url: 'https://carto.com/basemaps/'
  },
  {
    name: 'MeteoGate',
    kind: 'Heat warnings',
    url: 'https://meteogate.eu/'
  },
  {
    name: 'NASA FIRMS',
    kind: 'Worldwide heat detections',
    url: 'https://firms.modaps.eosdis.nasa.gov/'
  },
  {
    name: 'NIFC WFIGS',
    kind: 'USA incidents',
    url: 'https://www.nifc.gov/'
  },
  {
    name: 'NRCan CWFIS',
    kind: 'Canada incidents',
    url: 'https://cwfis.cfs.nrcan.gc.ca/en/'
  },
  {
    name: 'NASA EONET',
    kind: 'Reported fires',
    url: 'https://eonet.gsfc.nasa.gov/'
  },
  {
    name: 'Copernicus EFFIS Europe',
    kind: 'Europe fires',
    url: 'https://forest-fire.emergency.copernicus.eu/'
  },
  {
    name: 'Copernicus EFFIS Africa',
    kind: 'Africa fires',
    url: 'https://forest-fire.emergency.copernicus.eu/'
  }
]

export function DataSourceCarousel() {
  return (
    <footer
      className="data-source-carousel"
      aria-label="Data sources"
    >
      <span className="data-source-carousel-label">Data source</span>
      <div className="data-source-carousel-window">
        <div className="data-source-carousel-track">
          <SourceList />
          <span className="data-source-carousel-copy" aria-hidden="true">
            <SourceList duplicate />
          </span>
        </div>
      </div>
    </footer>
  )
}

function SourceList({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <span className="data-source-carousel-list">
      {DATA_SOURCES.map(source => (
        <span className="data-source-carousel-item" key={source.name}>
          <span>{source.kind}</span>
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            tabIndex={duplicate ? -1 : undefined}
          >
            {source.name}
          </a>
        </span>
      ))}
    </span>
  )
}
