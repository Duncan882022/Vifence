export interface DeviceGpsReading {
  lat: number
  lng: number
  accuracyM: number
  updatedAt: number
}

export function isDeviceGpsSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator
}

/** Theo dõi GPS thiết bị — cần quyền vị trí (iPhone/Safari: HTTPS hoặc localhost). */
export function watchDeviceGps(onUpdate: (reading: DeviceGpsReading) => void): () => void {
  if (!isDeviceGpsSupported()) return () => {}

  const opts: PositionOptions = {
    enableHighAccuracy: true,
    maximumAge: 2500,
    timeout: 12_000,
  }

  const emit = (pos: GeolocationPosition) => {
    onUpdate({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyM: pos.coords.accuracy,
      updatedAt: Date.now(),
    })
  }

  // First fix nhanh — không đợi watch tick đầu.
  navigator.geolocation.getCurrentPosition(emit, () => {}, opts)

  const watchId = navigator.geolocation.watchPosition(
    emit,
    () => {
      // Quyền bị từ chối — caller xử lý qua snapshot null.
    },
    opts,
  )

  return () => navigator.geolocation.clearWatch(watchId)
}
