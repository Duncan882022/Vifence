const METERS_PER_DEG_LAT = 111_320

/** Offset mét (đông / bắc) → lat/lng quanh điểm GPS. */
export function offsetLatLngByMeters(
  lat: number,
  lng: number,
  eastM: number,
  northM: number,
): [number, number] {
  const dLat = northM / METERS_PER_DEG_LAT
  const cosLat = Math.cos((lat * Math.PI) / 180)
  const dLng = eastM / (METERS_PER_DEG_LAT * Math.max(cosLat, 0.2))
  return [lat + dLat, lng + dLng]
}
