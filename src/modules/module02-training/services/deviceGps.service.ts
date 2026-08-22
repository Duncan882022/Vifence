/** GPS thiết bị — singleton watch (tránh spam CoreLocation trên iPhone). */

export interface DeviceGpsReading {
  lat: number
  lng: number
  accuracyM: number
  updatedAt: number
}

export type DeviceGpsErrorCode = 'denied' | 'unavailable' | 'timeout' | 'unsupported'

export function isDeviceGpsSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator
}

function mapGeoError(err: GeolocationPositionError): DeviceGpsErrorCode {
  if (err.code === err.PERMISSION_DENIED) return 'denied'
  if (err.code === err.TIMEOUT) return 'timeout'
  return 'unavailable' // POSITION_UNAVAILABLE ≈ kCLErrorLocationUnknown trên iOS
}

type Listener = {
  onUpdate: (reading: DeviceGpsReading) => void
  onError?: (code: DeviceGpsErrorCode) => void
}

let watchId: number | null = null
let listeners = new Set<Listener>()
let lastReading: DeviceGpsReading | null = null
let softRetryTimer = 0

const WATCH_OPTS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 15_000,
  timeout: 25_000,
}

const CACHE_OPTS: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: 120_000,
  timeout: 12_000,
}

function emitReading(pos: GeolocationPosition): void {
  lastReading = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracyM: pos.coords.accuracy,
    updatedAt: Date.now(),
  }
  listeners.forEach(l => l.onUpdate(lastReading!))
}

function emitError(code: DeviceGpsErrorCode): void {
  // denied = dừng; unavailable/timeout = CoreLocation chưa fix — giữ watch, retry mềm
  listeners.forEach(l => l.onError?.(code))
  if (code === 'denied') return
  window.clearTimeout(softRetryTimer)
  softRetryTimer = window.setTimeout(() => {
    if (!isDeviceGpsSupported() || listeners.size === 0) return
    navigator.geolocation.getCurrentPosition(
      emitReading,
      () => {},
      CACHE_OPTS,
    )
  }, 4_000)
}

function ensureWatchStarted(): void {
  if (!isDeviceGpsSupported() || watchId != null) return

  navigator.geolocation.getCurrentPosition(
    emitReading,
    err => emitError(mapGeoError(err)),
    CACHE_OPTS,
  )

  watchId = navigator.geolocation.watchPosition(
    emitReading,
    err => {
      const code = mapGeoError(err)
      // kCLErrorLocationUnknown → unavailable: không clear lastReading
      if (code !== 'denied' && lastReading) return
      emitError(code)
    },
    WATCH_OPTS,
  )
}

function maybeStopWatch(): void {
  if (listeners.size > 0 || watchId == null) return
  navigator.geolocation.clearWatch(watchId)
  watchId = null
  window.clearTimeout(softRetryTimer)
}

/**
 * Theo dõi GPS — share 1 watchPosition toàn app.
 * iPhone: LocationUnknown tạm thời không xoá vị trí cuối.
 */
export function watchDeviceGps(
  onUpdate: (reading: DeviceGpsReading) => void,
  onError?: (code: DeviceGpsErrorCode) => void,
): () => void {
  if (!isDeviceGpsSupported()) {
    onError?.('unsupported')
    return () => {}
  }

  const listener: Listener = { onUpdate, onError }
  listeners.add(listener)
  if (lastReading) onUpdate(lastReading)
  ensureWatchStarted()

  return () => {
    listeners.delete(listener)
    maybeStopWatch()
  }
}

export function getLastDeviceGpsReading(): DeviceGpsReading | null {
  return lastReading
}
