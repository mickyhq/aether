/**
 * Shared geospatial and math utilities for weather interpolation.
 */

export function distanceInKilometers(
  first: { latitude: number, longitude: number },
  second: { latitude: number, longitude: number }
) {
  const earthRadius = 6371
  const latitudeDelta = degreesToRadians(second.latitude - first.latitude)
  const longitudeDelta = degreesToRadians(normalizeLongitude(second.longitude - first.longitude))
  const firstLatitude = degreesToRadians(first.latitude)
  const secondLatitude = degreesToRadians(second.latitude)
  const haversine = (
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
    Math.cos(secondLatitude) *
    Math.sin(longitudeDelta / 2) ** 2
  )

  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export function inverseDistanceWeight(distance: number) {
  return 1 / Math.max(distance * distance, 0.01)
}

export function normalizeLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180
}

export function normalizeAngle(angle: number) {
  return ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
}

export function degreesToRadians(degrees: number) {
  return degrees * Math.PI / 180
}

export function radiansToDegrees(radians: number) {
  return radians * 180 / Math.PI
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}