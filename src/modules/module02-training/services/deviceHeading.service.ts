/** Device compass heading — DeviceOrientation (absolute when available). */

let lastHeading: number | null = null
let listening = false
let refCount = 0

function normalizeHeading(deg: number): number {
  return ((deg % 360) + 360) % 360
}

function onOrientation(ev: DeviceOrientationEvent): void {
  const abs = ev as DeviceOrientationEvent & { absolute?: boolean; webkitCompassHeading?: number }
  // iOS Safari often exposes webkitCompassHeading
  if (typeof abs.webkitCompassHeading === 'number' && Number.isFinite(abs.webkitCompassHeading)) {
    lastHeading = normalizeHeading(abs.webkitCompassHeading)
    return
  }
  if (typeof ev.alpha === 'number' && Number.isFinite(ev.alpha)) {
    // absolute alpha ≈ compass; non-absolute is relative — still usable as bearing approx
    lastHeading = normalizeHeading(360 - ev.alpha)
  }
}

function ensureListening(): void {
  if (listening || typeof window === 'undefined') return
  window.addEventListener('deviceorientationabsolute', onOrientation as EventListener, true)
  window.addEventListener('deviceorientation', onOrientation as EventListener, true)
  listening = true
}

function maybeStop(): void {
  if (refCount > 0 || !listening || typeof window === 'undefined') return
  window.removeEventListener('deviceorientationabsolute', onOrientation as EventListener, true)
  window.removeEventListener('deviceorientation', onOrientation as EventListener, true)
  listening = false
}

/** Subscribe so orientation events keep updating; returns unsubscribe. */
export function watchDeviceHeading(): () => void {
  refCount += 1
  ensureListening()
  return () => {
    refCount = Math.max(0, refCount - 1)
    maybeStop()
  }
}

export function getLastDeviceHeading(): number | null {
  return lastHeading
}

/** iOS 13+ may require permission before orientation events fire. */
export async function requestDeviceHeadingPermission(): Promise<boolean> {
  const DOE = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
  }
  if (typeof DOE.requestPermission === 'function') {
    try {
      const res = await DOE.requestPermission()
      if (res === 'granted') {
        ensureListening()
        return true
      }
      return false
    } catch {
      return false
    }
  }
  ensureListening()
  return true
}
