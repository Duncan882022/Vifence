import { ensureCameraPermission, isDeviceCameraSupported } from '@/modules/module02-training/services/deviceCamera.service'
import {
  getLastDeviceGpsReading,
  isDeviceGpsSupported,
  watchDeviceGps,
} from '@/modules/module02-training/services/deviceGps.service'
import { setPatrolHelmetGps } from '@/services/patrolHelmetGpsBridge'

export type PermissionOutcome = 'granted' | 'denied' | 'unsupported' | 'insecure' | 'timeout' | 'unavailable'

export interface HelmetDevicePermissionResult {
  camera: PermissionOutcome
  location: PermissionOutcome
  locationMessage?: string
  gpsSeeded?: boolean
}

function isSecureBrowsingContext(): boolean {
  if (typeof window === 'undefined') return false
  if (window.isSecureContext) return true
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1'
}

function locationErrorMessage(outcome: PermissionOutcome, code?: number): string {
  if (outcome === 'insecure') {
    return 'Trang đang mở bằng HTTP (không phải HTTPS/localhost). Safari/Chrome chặn GPS. Mở CMS qua https://… hoặc http://localhost:…'
  }
  if (outcome === 'timeout') {
    return 'Quyền Location OK nhưng chưa bắt được tín hiệu GPS kịp. Ra gần cửa sổ / bật Wi‑Fi, đợi vài giây rồi bấm lại (có thể cần 15–30s trong nhà).'
  }
  if (outcome === 'denied' || code === 1) {
    return 'Quyền Location đang bị chặn. iPhone: Cài đặt → Quyền riêng tư → Dịch vụ định vị → Bật + Safari/Chrome → Khi dùng app.'
  }
  if (outcome === 'unavailable' || code === 2) {
    return 'iPhone tạm chưa có GPS (LocationUnknown — hay gặp trong nhà). Không phải từ chối quyền. Bật Wi‑Fi, đợi 10–30s hoặc ra gần cửa sổ rồi bấm lại.'
  }
  return 'Không lấy được vị trí. Kiểm tra quyền Location rồi bấm lại.'
}

function readPositionOnce(options: PositionOptions): Promise<{
  ok: true
  reading: { lat: number; lng: number; accuracyM: number }
} | { ok: false; code?: number }> {
  return new Promise(resolve => {
    if (!isDeviceGpsSupported()) {
      resolve({ ok: false })
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        resolve({
          ok: true,
          reading: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy,
          },
        })
      },
      err => resolve({ ok: false, code: err.code }),
      options,
    )
  })
}

/**
 * Chờ GPS qua singleton watchDeviceGps — tránh mở nhiều CoreLocation session.
 */
function waitForGpsFix(timeoutMs = 40_000): Promise<{
  ok: true
  reading: { lat: number; lng: number; accuracyM: number }
} | { ok: false; code?: number }> {
  return new Promise(resolve => {
    if (!isDeviceGpsSupported()) {
      resolve({ ok: false })
      return
    }

    const cached = getLastDeviceGpsReading()
    if (cached && Date.now() - cached.updatedAt < 120_000) {
      resolve({ ok: true, reading: cached })
      return
    }

    let settled = false
    let stopWatch = () => {}
    const finish = (result: {
      ok: true
      reading: { lat: number; lng: number; accuracyM: number }
    } | { ok: false; code?: number }) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      stopWatch()
      resolve(result)
    }

    stopWatch = watchDeviceGps(
      reading => finish({ ok: true, reading }),
      code => {
        if (code === 'denied') finish({ ok: false, code: 1 })
        // unavailable/timeout: giữ watch đến hết hạn — LocationUnknown tạm thời
      },
    )

    const timer = window.setTimeout(() => {
      const last = getLastDeviceGpsReading()
      if (last) finish({ ok: true, reading: last })
      else finish({ ok: false, code: 3 })
    }, timeoutMs)
  })
}

async function requestLocationWithFallback(): Promise<{
  outcome: PermissionOutcome
  reading?: { lat: number; lng: number; accuracyM: number }
  code?: number
}> {
  if (!isDeviceGpsSupported()) {
    return { outcome: 'unsupported' }
  }
  if (!isSecureBrowsingContext()) {
    return { outcome: 'insecure' }
  }

  const mem = getLastDeviceGpsReading()
  if (mem && Date.now() - mem.updatedAt < 120_000) {
    return { outcome: 'granted', reading: mem }
  }

  // 1) Cache trình duyệt (Wi‑Fi / cell)
  const cached = await readPositionOnce({
    enableHighAccuracy: false,
    maximumAge: 120_000,
    timeout: 10_000,
  })
  if (cached.ok) return { outcome: 'granted', reading: cached.reading }
  if (cached.code === 1) return { outcome: 'denied', code: 1 }

  // 2) Singleton watch — chờ LocationUnknown hết
  const watched = await waitForGpsFix(40_000)
  if (watched.ok) return { outcome: 'granted', reading: watched.reading }
  if (watched.code === 1) return { outcome: 'denied', code: 1 }
  if (watched.code === 3) return { outcome: 'timeout', code: 3 }
  return { outcome: 'unavailable', code: watched.code }
}

/**
 * Xin quyền Camera + Location (HC-02).
 * Nên gọi từ click user trên iOS/Safari.
 */
export async function requestHelmetDevicePermissions(
  cameraId = 'HC-02',
): Promise<HelmetDevicePermissionResult> {
  let camera: PermissionOutcome = 'unsupported'

  if (isDeviceCameraSupported()) {
    try {
      await ensureCameraPermission()
      camera = 'granted'
    } catch {
      camera = 'denied'
    }
  }

  const loc = await requestLocationWithFallback()
  const locationMessage = loc.outcome === 'granted'
    ? undefined
    : locationErrorMessage(loc.outcome, loc.code)

  if (loc.outcome === 'granted' && loc.reading) {
    setPatrolHelmetGps({
      cameraId,
      lat: loc.reading.lat,
      lng: loc.reading.lng,
      accuracyM: loc.reading.accuracyM,
      updatedAt: Date.now(),
    })
  }

  return {
    camera,
    location: loc.outcome,
    locationMessage,
    gpsSeeded: loc.outcome === 'granted',
  }
}

export function describeLocationHelp(): string {
  return 'Tip: trong nhà GPS chậm là bình thường — giữ Wi‑Fi bật, đợi đến ~30s rồi bấm lại.'
}
