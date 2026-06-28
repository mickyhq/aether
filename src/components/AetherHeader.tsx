import PublicIcon from '@mui/icons-material/Public'
import SearchIcon from '@mui/icons-material/Search'
import { Box, IconButton, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import type { FormEvent } from 'react'
import type { WeatherLocation } from '../types/weather'

type AetherHeaderProps = {
  location: WeatherLocation
  status: string
  onSearch: (query: string) => void
}

export function AetherHeader({ location, status, onSearch }: AetherHeaderProps) {
  const [query, setQuery] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSearch(query)
  }

  return (
    <Box className="aether-header">
      <Stack direction="row" alignItems="center" gap={1.25} className="brand-block">
        <Box className="brand-mark">
          <PublicIcon fontSize="small" />
        </Box>
        <Typography variant="subtitle2" className="brand-name">
          Aether
        </Typography>
        <span className="brand-divider" />
        <Typography variant="body2" className="brand-place">
          {location.label}
        </Typography>
      </Stack>

      <Box component="form" className="map-search" onSubmit={handleSubmit}>
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
        <Typography variant="caption" className="search-status">
          {status}
        </Typography>
      </Box>
    </Box>
  )
}
