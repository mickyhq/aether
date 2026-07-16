export const validWeatherMapSampleFixture = {
  label: 'Paris',
  latitude: 48.8566,
  longitude: 2.3522,
  updatedAt: 1_700_000_000_000,
  observedAt: '2026-07-16T12:00',
  showBadge: true,
  estimated: false,
  evolution: [
    {
      time: '2026-07-16T12:00',
      temperature: 24,
      precipitation: 0,
      snowfall: 0,
      weatherCode: 1,
      cloudOpacity: 0.2,
      windSpeed: 18,
      rawWindSpeed: 5,
      windAngle: 270,
      isThunderstorm: false
    }
  ],
  sunrise: '2026-07-16T04:05',
  sunset: '2026-07-16T19:48',
  temperature: 24,
  precipitation: 0,
  snowfall: 0,
  weatherCode: 1,
  windSpeed: 18,
  rawWindSpeed: 5,
  windAngle: 270,
  cloudOpacity: 0.2,
  isThunderstorm: false
}

export const invalidWeatherMapSampleFixture = {
  ...validWeatherMapSampleFixture,
  windSpeed: 'fast'
}

export const validAirQualityMapSampleFixture = {
  latitude: 48.8566,
  longitude: 2.3522,
  updatedAt: 1_700_000_000_000,
  observedAt: '2026-07-16T12:00',
  europeanAqi: 32,
  pm2_5: 8,
  pm10: 14,
  nitrogenDioxide: 18,
  ozone: 52
}

export const invalidAirQualityMapSampleFixture = {
  ...validAirQualityMapSampleFixture,
  observedAt: null
}
