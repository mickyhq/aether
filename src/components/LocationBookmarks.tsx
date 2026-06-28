import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder'
import BookmarkIcon from '@mui/icons-material/Bookmark'
import HistoryIcon from '@mui/icons-material/History'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import StarIcon from '@mui/icons-material/Star'
import {
  Box,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import type { WeatherLocation } from '../types/weather'

type LocationBookmarksProps = {
  location: WeatherLocation
  onSelect: (location: WeatherLocation) => void
}

const FAVORITES_KEY = 'aether:favorite-locations'
const RECENTS_KEY = 'aether:recent-locations'
const MAX_RECENTS = 5

export function LocationBookmarks({
  location,
  onSelect
}: LocationBookmarksProps) {
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
  const [favorites, setFavorites] = useState<WeatherLocation[]>(
    () => loadLocations(FAVORITES_KEY)
  )
  const [recents, setRecents] = useState<WeatherLocation[]>(
    () => loadLocations(RECENTS_KEY)
  )
  const isFavorite = useMemo(
    () => favorites.some(item => locationsMatch(item, location)),
    [favorites, location]
  )

  useEffect(() => {
    setRecents(current => {
      const next = [
        location,
        ...current.filter(item => !locationsMatch(item, location))
      ].slice(0, MAX_RECENTS)

      saveLocations(RECENTS_KEY, next)
      return next
    })
  }, [location])

  function openMenu(event: MouseEvent<HTMLElement>) {
    setAnchorElement(event.currentTarget)
  }

  function closeMenu() {
    setAnchorElement(null)
  }

  function toggleFavorite() {
    setFavorites(current => {
      const next = isFavorite
        ? current.filter(item => !locationsMatch(item, location))
        : [location, ...current]

      saveLocations(FAVORITES_KEY, next)
      return next
    })
  }

  function selectLocation(nextLocation: WeatherLocation) {
    onSelect(nextLocation)
    closeMenu()
  }

  return (
    <>
      <Tooltip title="Favorite and recent locations">
        <IconButton
          type="button"
          aria-label="Favorite and recent locations"
          aria-haspopup="menu"
          aria-expanded={Boolean(anchorElement)}
          className="location-bookmarks-button"
          onClick={openMenu}
        >
          {isFavorite ? <BookmarkIcon /> : <BookmarkBorderIcon />}
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorElement}
        open={Boolean(anchorElement)}
        onClose={closeMenu}
        slotProps={{
          paper: {
            className: 'location-bookmarks-menu'
          }
        }}
      >
        <MenuItem onClick={toggleFavorite}>
          {isFavorite ? <StarIcon /> : <StarBorderIcon />}
          <Typography>
            {isFavorite ? 'Remove current favorite' : 'Favorite current location'}
          </Typography>
        </MenuItem>

        <Divider />
        <LocationSection
          icon={<StarIcon />}
          title="Favorites"
          locations={favorites}
          emptyLabel="No favorites"
          onSelect={selectLocation}
        />

        <Divider />
        <LocationSection
          icon={<HistoryIcon />}
          title="Recent"
          locations={recents}
          emptyLabel="No recent locations"
          onSelect={selectLocation}
        />
      </Menu>
    </>
  )
}

type LocationSectionProps = {
  icon: React.ReactNode
  title: string
  locations: WeatherLocation[]
  emptyLabel: string
  onSelect: (location: WeatherLocation) => void
}

function LocationSection({
  icon,
  title,
  locations,
  emptyLabel,
  onSelect
}: LocationSectionProps) {
  return (
    <Box className="location-bookmarks-section">
      <Box className="location-bookmarks-heading">
        {icon}
        <Typography variant="overline">{title}</Typography>
      </Box>

      {locations.length === 0 ? (
        <Typography className="location-bookmarks-empty">
          {emptyLabel}
        </Typography>
      ) : locations.map(location => (
        <MenuItem
          key={getLocationKey(location)}
          onClick={() => onSelect(location)}
        >
          <Box className="location-bookmarks-label">
            <Typography>{location.label}</Typography>
            <Typography variant="caption">
              {location.latitude.toFixed(3)}, {location.longitude.toFixed(3)}
            </Typography>
          </Box>
        </MenuItem>
      ))}
    </Box>
  )
}

function loadLocations(key: string) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]')

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(isWeatherLocation)
  } catch {
    return []
  }
}

function saveLocations(key: string, locations: WeatherLocation[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(locations))
  } catch {
    return
  }
}

function isWeatherLocation(value: unknown): value is WeatherLocation {
  if (!value || typeof value !== 'object') {
    return false
  }

  const location = value as Partial<WeatherLocation>

  return (
    typeof location.label === 'string' &&
    typeof location.latitude === 'number' &&
    Number.isFinite(location.latitude) &&
    typeof location.longitude === 'number' &&
    Number.isFinite(location.longitude)
  )
}

function locationsMatch(first: WeatherLocation, second: WeatherLocation) {
  return getLocationKey(first) === getLocationKey(second)
}

function getLocationKey(location: WeatherLocation) {
  return `${location.latitude.toFixed(4)}:${location.longitude.toFixed(4)}`
}
