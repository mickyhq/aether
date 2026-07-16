import type { RuntimeResponseSchemaName } from '../../src/schemas/serverResponses'

const hourly = {
  time: ['2026-07-16T12:00'],
  temperature_2m: [21],
  precipitation: [0.2],
  snowfall: [0],
  weather_code: [1],
  cloud_cover: [20],
  wind_speed_10m: [14],
  wind_direction_10m: [220]
}

export const validRuntimeResponseFixtures = {
  searchGeocode: {
    location: { latitude: 48.8566, longitude: 2.3522, label: 'Paris' }
  },
  reverseGeocode: { label: 'Paris, France' },
  ecmwf: {
    latitude: 48.8566,
    longitude: 2.3522,
    model: 'ECMWF IFS 9 km',
    utc_offset_seconds: 7200,
    hourly
  },
  openMeteo: {
    latitude: 48.8566,
    longitude: 2.3522,
    timezone: 'Europe/Paris',
    current: {
      temperature_2m: 21,
      weather_code: 1,
      cloud_cover: 20,
      wind_speed_10m: 14,
      wind_direction_10m: 220
    },
    hourly
  },
  airQuality: {
    latitude: 48.8566,
    longitude: 2.3522,
    current: {
      european_aqi: 27,
      pm2_5: 6,
      pm10: 12,
      nitrogen_dioxide: 8,
      ozone: 54
    }
  },
  jetStream: {
    current: {
      wind_speed_250hPa: 145,
      wind_direction_250hPa: 275
    }
  },
  temperatureNormal: {
    baseline: '1991–2020',
    source: 'ERA5-Land via Open-Meteo',
    resolution: '11 km',
    targetTime: '2026-07-16T12:00:00.000Z',
    samples: [{
      latitude: 48.8566,
      longitude: 2.3522,
      normalTemperature: 22.4,
      yearCount: 30
    }]
  },
  officialWarnings: {
    generatedAt: '2026-07-16T12:00:00Z',
    cacheState: 'live',
    gracePeriodMinutes: 15,
    warnings: [{
      id: 'warning-1',
      provider: 'meteoalarm',
      hazard: 'extreme-temperature',
      title: 'Heat warning',
      description: 'High temperatures expected.',
      severity: 'moderate',
      certainty: 'likely',
      effectiveAt: '2026-07-16T12:00:00Z',
      expiresAt: '2026-07-16T18:00:00Z',
      updatedAt: '2026-07-16T11:45:00Z',
      instructions: 'Avoid peak heat.',
      area: 'Paris',
      source: 'MeteoAlarm member service',
      sourceUrl: null,
      geometry: null,
      state: 'active',
      references: []
    }],
    providers: [{
      id: 'meteoalarm',
      source: 'MeteoAlarm member services',
      status: 'available'
    }]
  },
  stargazing: {
    initializedAt: '2026-07-16T12:00:00Z',
    lightPollution: { estimatedBortle: '4', classCode: 4 },
    nights: [{
      date: '2026-07-16',
      score: 82,
      rating: 'Excellent',
      bestTime: '2026-07-16T23:00:00Z',
      cloudCover: 8,
      seeingArcseconds: 1.2,
      transparency: 0.18,
      moonIllumination: 22,
      moonPhase: 'Waxing crescent'
    }]
  },
  soilMoisture: {
    date: '2026-07-15',
    rootZonePercent: 42,
    surfacePercent: 36,
    percentile: 48,
    category: 'Near normal',
    trend: -0.1,
    model: 'ERA5-Land',
    resolution: '11 km',
    baseline: '1991–2020',
    latitude: 48.8566,
    longitude: 2.3522
  },
  temperatureRecords: {
    highest: { temperature: 40.1, date: '1947-07-28' },
    lowest: { temperature: -14.6, date: '1879-12-10' },
    period: { start: '1940-01-01', end: '2025-12-31' },
    model: 'ERA5-Land',
    resolution: '11 km',
    latitude: 48.8566,
    longitude: 2.3522
  },
  webcam: { configured: false },
  nearbyWebcams: {
    configured: true,
    radiusKm: 50,
    total: 1,
    webcams: [{
      id: 1,
      title: 'Paris skyline',
      city: 'Paris',
      distanceKm: 2.4,
      playerUrl: 'https://webcams.windy.com/player/1',
      detailUrl: 'https://www.windy.com/webcams/1',
      live: true,
      updatedAt: '2026-07-16T12:00:00Z'
    }]
  },
  oceanCurrent: {
    source: 'NOAA NESDIS CoastWatch',
    currentProduct: 'Daily global geostrophic surface currents',
    temperatureProduct: 'NOAA OISST v2.1',
    enso: null,
    currentTime: '2026-07-15T00:00:00Z',
    temperatureTime: '2026-07-15T00:00:00Z',
    stride: 2,
    oceanSampleCount: 1,
    samples: [{
      latitude: 42,
      longitude: 3,
      ocean: true,
      eastward: 0.2,
      northward: -0.1,
      speed: 0.22,
      temperature: 24.5,
      anomaly: 0.7
    }]
  },
  reportedFires: {
    fires: [{
      id: 'fire-1',
      title: 'Example fire',
      description: null,
      latitude: 43,
      longitude: 6,
      reportedAt: '2026-07-16T10:00:00Z',
      magnitude: null,
      source: 'NASA EONET',
      sourceUrl: null
    }]
  },
  volcanoActivity: {
    reportPublishedAt: '2026-07-16T00:00:00Z',
    notice: 'Preliminary report.',
    volcanoes: [{
      id: 'volcano-1',
      volcanoNumber: '211004',
      name: 'Etna',
      country: 'Italy',
      reportPeriod: '10–16 July 2026',
      activity: 'eruption',
      activityLabel: 'Eruption',
      latitude: 37.75,
      longitude: 14.99,
      summary: 'Activity observed.',
      publishedAt: '2026-07-16T00:00:00Z',
      reportUrl: 'https://volcano.si.edu/reports_weekly.cfm',
      profileUrl: 'https://volcano.si.edu/volcano.cfm?vn=211004'
    }]
  },
  seismicEvents: {
    generatedAt: '2026-07-17T10:00:00Z',
    cacheState: 'live',
    gracePeriodMinutes: 15,
    earthquakes: [{
      id: 'us-test-earthquake',
      magnitude: 5.4,
      place: 'Test region',
      occurredAt: '2026-07-17T09:45:00Z',
      updatedAt: '2026-07-17T09:50:00Z',
      latitude: 35.2,
      longitude: 140.1,
      depthKm: 18,
      tsunamiProduct: false,
      alert: 'green',
      status: 'reviewed',
      source: 'USGS Earthquake Hazards Program',
      sourceUrl: 'https://earthquake.usgs.gov/earthquakes/eventpage/us-test-earthquake'
    }],
    tsunamiWarnings: [{
      id: 'PHEB-test',
      level: 'warning',
      title: 'Tsunami Warning',
      description: 'Dangerous waves are possible.',
      instructions: 'Follow local evacuation instructions.',
      sentAt: '2026-07-17T09:55:00Z',
      expiresAt: '2026-07-17T11:00:00Z',
      latitude: 35.2,
      longitude: 140.1,
      magnitude: 7.2,
      location: 'Test region',
      source: 'NOAA Pacific Tsunami Warning Center',
      sourceUrl: 'https://www.tsunami.gov/',
      state: 'active'
    }]
  },
  radarMetadata: {
    frames: [{ time: 1784203200, path: '/v2/radar/1784203200' }]
  },
  fireLayerStatus: { firmsConfigured: true }
} satisfies Record<RuntimeResponseSchemaName, unknown>

export const invalidRuntimeResponseFixtures = {
  searchGeocode: { location: { latitude: '48', longitude: 2, label: 'Paris' } },
  reverseGeocode: { label: 42 },
  ecmwf: { latitude: 48, longitude: 2, hourly: {} },
  openMeteo: { current: {}, hourly: {} },
  airQuality: { current: { european_aqi: 'bad' } },
  jetStream: { current: { wind_speed_250hPa: null } },
  temperatureNormal: { baseline: '1991–2020', samples: [{ yearCount: '30' }] },
  officialWarnings: { warnings: [{ severity: 'notice' }] },
  stargazing: { initializedAt: 123, lightPollution: null, nights: [] },
  soilMoisture: { date: '2026-07-15', percentile: Number.NaN },
  temperatureRecords: { highest: null, lowest: null },
  webcam: { configured: 'yes' },
  nearbyWebcams: { configured: true, radiusKm: 50, total: 1, webcams: null },
  oceanCurrent: { samples: 'ocean' },
  reportedFires: { fires: [{ id: 1 }] },
  volcanoActivity: { volcanoes: [{ activity: 'unknown' }] },
  seismicEvents: { earthquakes: [{ magnitude: 'strong' }] },
  radarMetadata: { frames: [{ time: 'now', path: null }] },
  fireLayerStatus: { firmsConfigured: 'true' }
} satisfies Record<RuntimeResponseSchemaName, unknown>
