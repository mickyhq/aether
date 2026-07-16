import SearchIcon from '@mui/icons-material/Search'
import { Box, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { useState } from 'react'
import type { FormEvent } from 'react'
import type { WeatherDataState, WeatherLocation } from '../types/weather'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { AboutDialog } from './AboutDialog'
import { LocationBookmarks } from './LocationBookmarks'
import { SetupDialog } from './SetupDialog'
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
  const { t } = useI18n()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSearch(query)
  }

const dataStateTooltip = (
  <dl className="data-state-legend">
    <dt>{t('data.live')}</dt>
    <dd>{t('data.liveDetail')}</dd>
    <dt>{t('data.cached')}</dt>
    <dd>{t('data.cachedDetail')}</dd>
    <dt>{t('data.stale')}</dt>
    <dd>{t('data.staleDetail')}</dd>
    <dt>{t('data.unavailable')}</dt>
    <dd>{t('data.unavailableDetail')}</dd>
  </dl>
) as unknown as React.ReactNode

  return (
    <Box component="header" className="aether-header" aria-label={t('header.controls')}>
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
          aria-label={t('header.locationSearch')}
          onSubmit={handleSubmit}
        >
          <TextField
            size="small"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('header.searchCity')}
            inputProps={{ 'aria-label': t('header.searchCity') }}
            className="city-search-input"
          />
          <IconButton type="submit" aria-label={t('header.search')} className="city-search-button">
            <SearchIcon fontSize="small" />
          </IconButton>
          <Box className="weather-status-group">
            <Tooltip
              title={dataStateTooltip}
              componentsProps={{ tooltip: { className: 'data-state-tooltip' } }}
              enterDelay={200}
              leaveDelay={200}
            >
              <Typography
                variant="caption"
                role="status"
                className={`search-status search-status-${dataState}`}
              >
                {translateStatus(status, t)}
              </Typography>
            </Tooltip>
            <WeatherRetryButton
              visible={dataState === 'stale' || dataState === 'unavailable'}
              onRetry={onWeatherRetry}
            />
          </Box>
        </Box>
        <SetupDialog />
        <AboutDialog />
      </Box>
    </Box>
  )
}

function translateStatus(
  status: string,
  t: (key: TranslationKey) => string
) {
  const statusKeys: Record<string, TranslationKey> = {
    'Reading sky': 'status.readingSky',
    Locating: 'status.locating',
    'Searching city': 'status.searchingCity',
    Live: 'data.live',
    Cached: 'data.cached',
    Stale: 'data.stale',
    Unavailable: 'data.unavailable',
    'City search failed': 'status.cityFailed',
    'Map weather failed': 'status.mapFailed',
    'Ocean currents failed': 'status.oceanFailed'
  }

  if (statusKeys[status]) return t(statusKeys[status])
  if (/city|geocod/i.test(status)) return t('status.cityFailed')
  if (/ocean/i.test(status)) return t('status.oceanFailed')
  if (/map|weather/i.test(status)) return t('status.mapFailed')
  return status
}
