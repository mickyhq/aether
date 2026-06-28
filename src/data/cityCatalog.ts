import type { WeatherLocation } from '../types/weather'

export type CityOption = WeatherLocation & {
  id: string
}

export type RegionOption = {
  id: string
  name: string
  mapShape: Array<[number, number]>
  cities: CityOption[]
}

export type CountryOption = {
  id: string
  name: string
  regions: RegionOption[]
}

export const cityCatalog: CountryOption[] = [
  {
    id: 'fr',
    name: 'France',
    regions: [
      {
        id: 'corse',
        name: 'Corse',
        mapShape: [[0.1, 0.48], [0.36, 0.38], [0.72, 0.32], [0.92, 0.52], [0.8, 0.78], [0.52, 0.92], [0.2, 0.8], [0.04, 0.62]],
        cities: [
          { id: 'ajaccio', label: 'Ajaccio', latitude: 41.9192, longitude: 8.7386 },
          { id: 'bastia', label: 'Bastia', latitude: 42.7000, longitude: 9.4500 }
        ]
      },
      {
        id: 'idf',
        name: 'Ile-de-France',
        mapShape: [[0.16, 0.28], [0.34, 0.12], [0.63, 0.16], [0.86, 0.34], [0.78, 0.72], [0.52, 0.9], [0.22, 0.78], [0.08, 0.52]],
        cities: [
          { id: 'paris', label: 'Paris', latitude: 48.8566, longitude: 2.3522 },
          { id: 'versailles', label: 'Versailles', latitude: 48.8049, longitude: 2.1204 },
          { id: 'fontainebleau', label: 'Fontainebleau', latitude: 48.4047, longitude: 2.7016 }
        ]
      },
      {
        id: 'paca',
        name: 'Provence-Alpes-Cote d Azur',
        mapShape: [[0.1, 0.28], [0.38, 0.16], [0.72, 0.22], [0.92, 0.44], [0.84, 0.74], [0.58, 0.86], [0.3, 0.78], [0.14, 0.58]],
        cities: [
          { id: 'marseille', label: 'Marseille', latitude: 43.2965, longitude: 5.3698 },
          { id: 'nice', label: 'Nice', latitude: 43.7102, longitude: 7.262 },
          { id: 'avignon', label: 'Avignon', latitude: 43.9493, longitude: 4.8055 }
        ]
      }
    ]
  },
  {
    id: 'us',
    name: 'United States',
    regions: [
      {
        id: 'ca',
        name: 'California',
        mapShape: [[0.38, 0.08], [0.56, 0.12], [0.64, 0.34], [0.72, 0.58], [0.6, 0.92], [0.42, 0.86], [0.28, 0.58], [0.22, 0.28]],
        cities: [
          { id: 'los-angeles', label: 'Los Angeles', latitude: 34.0522, longitude: -118.2437 },
          { id: 'san-francisco', label: 'San Francisco', latitude: 37.7749, longitude: -122.4194 },
          { id: 'san-diego', label: 'San Diego', latitude: 32.7157, longitude: -117.1611 }
        ]
      },
      {
        id: 'ny',
        name: 'New York',
        mapShape: [[0.18, 0.5], [0.34, 0.24], [0.64, 0.16], [0.86, 0.3], [0.78, 0.52], [0.62, 0.58], [0.58, 0.84], [0.36, 0.72]],
        cities: [
          { id: 'new-york-city', label: 'New York City', latitude: 40.7128, longitude: -74.006 },
          { id: 'buffalo', label: 'Buffalo', latitude: 42.8864, longitude: -78.8784 },
          { id: 'albany', label: 'Albany', latitude: 42.6526, longitude: -73.7562 }
        ]
      }
    ]
  },
  {
    id: 'jp',
    name: 'Japan',
    regions: [
      {
        id: 'kanto',
        name: 'Kanto',
        mapShape: [[0.36, 0.08], [0.58, 0.18], [0.74, 0.4], [0.68, 0.76], [0.48, 0.92], [0.28, 0.74], [0.22, 0.42]],
        cities: [
          { id: 'tokyo', label: 'Tokyo', latitude: 35.6762, longitude: 139.6503 },
          { id: 'yokohama', label: 'Yokohama', latitude: 35.4437, longitude: 139.638 },
          { id: 'saitama', label: 'Saitama', latitude: 35.8617, longitude: 139.6455 }
        ]
      },
      {
        id: 'kansai',
        name: 'Kansai',
        mapShape: [[0.16, 0.38], [0.36, 0.2], [0.68, 0.18], [0.88, 0.4], [0.76, 0.7], [0.48, 0.84], [0.22, 0.68]],
        cities: [
          { id: 'osaka', label: 'Osaka', latitude: 34.6937, longitude: 135.5023 },
          { id: 'kyoto', label: 'Kyoto', latitude: 35.0116, longitude: 135.7681 },
          { id: 'kobe', label: 'Kobe', latitude: 34.6901, longitude: 135.1955 }
        ]
      }
    ]
  }
]

export const defaultCity: WeatherLocation = {
  label: 'Ajaccio, Corsica',
  latitude: 41.9192,
  longitude: 8.7386
}
