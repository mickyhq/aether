import SearchIcon from '@mui/icons-material/Search'
import { Box, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { useState } from 'react'
import type { FormEvent } from 'react'
import type { WeatherDataState, WeatherLocation } from '../types/weather'
import { LocationBookmarks } from './LocationBookmarks'
import { WeatherRetryButton } from './WeatherRetryButton'

type AetherHeaderProps = {
  location: WeatherLocation
  status: string
  dataState: WeatherDataState
  onSearch: (query: string) => void
  onLocationSelect: (location: WeatherLocation) => void
  onWeatherRetry: () => void
}

export function AetherHeader({
  location,
  status,
  dataState,
  onSearch,
  onLocationSelect,
  onWeatherRetry
}: AetherHeaderProps) {
  const [query, setQuery] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSearch(query)
  }

const DATA_STATE_TOOLTIP = (
  <dl className="data-state-legend">
    <dt>Live</dt>
    <dd>Fresh data from Open-Meteo API</dd>
    <dt>Cached</dt>
    <dd>Served from CDN cache or local storage</dd>
    <dt>Stale</dt>
    <dd>Cached data served when upstream was unreachable</dd>
    <dt>Unavailable</dt>
    <dd>No data could be retrieved from any source</dd>
  </dl>
) as unknown as React.ReactNode

  return (
    <Box component="header" className="aether-header" aria-label="Aether controls">
      <Stack direction="row" alignItems="center" gap={1.25} className="brand-block">
        <Box className="brand-mark">
          <img src="/aether.svg" alt="" className="brand-logo" />
        </Box>
        <Box className="brand-copy">
          <Typography variant="subtitle2" className="brand-name">
            Aether
          </Typography>
          <Typography variant="caption" className="brand-version">
            {import.meta.env.VITE_AETHER_BUILD_VERSION}
          </Typography>
        </Box>
        <span className="brand-divider" />
        <Typography variant="h6" className="brand-place">
          {location.label}
        </Typography>
      </Stack>

      <Box className="header-actions">
        <LocationBookmarks
          location={location}
          onSelect={onLocationSelect}
        />

        <Box
          component="form"
          className="map-search"
          aria-label="Location search"
          onSubmit={handleSubmit}
        >
          <TextField
            size="small"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search city"
            inputProps={{ 'aria-label': 'Search city' }}
            className="city-search-input"
          />
          <IconButton type="submit" aria-label="Search" className="city-search-button">
            <SearchIcon fontSize="small" />
          </IconButton>
          <Box className="weather-status-group">
            <Tooltip
              title={DATA_STATE_TOOLTIP}
              componentsProps={{ tooltip: { className: 'data-state-tooltip' } }}
              enterDelay={200}
              leaveDelay={200}
            >
              <Typography
                variant="caption"
                role="status"
                className={`search-status search-status-${dataState}`}
              >
                {status}
              </Typography>
            </Tooltip>
            <WeatherRetryButton
              visible={dataState === 'stale' || dataState === 'unavailable'}
              onRetry={onWeatherRetry}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
