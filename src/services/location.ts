import type { WeatherLocation } from '../types/weather'

const PARIS_LOCATION: WeatherLocation = {
  latitude: 48.8566,
  longitude: 2.3522,
  label: 'Paris'
}

export async function getBrowserLocation(): Promise<WeatherLocation> {
  if (!navigator.geolocation) {
    return PARIS_LOCATION
  }

  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      position => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: 'Local sky'
        })
      },
      () => resolve(PARIS_LOCATION),
      {
        enableHighAccuracy: false,
        maximumAge: 1000 * 60 * 20,
        timeout: 5000
      }
    )
  })
}
