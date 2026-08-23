/** Map camera Mobile Module 03 → thiết bị vật lý (label sau khi cấp quyền). */
const MOBILE_DEVICE_LABEL_MATCH: Record<string, RegExp> = {
  'MOB-01': /iphone|ipad|continuity/i,
  'MOB-02': /facetime|imac|built[- ]?in/i,
  /** HC-02 Helmet — không ép label iPhone; dùng facingMode / device index. */
}

const MOBILE_DEVICE_INDEX: Record<string, number> = {
  'MOB-01': 0,
  'MOB-02': 1,
  'HC-02': 0,
}

export function isDeviceCameraSupported(): boolean {
  return typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)
}

export async function listVideoInputDevices(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter(d => d.kind === 'videoinput')
}

/** Một số trình duyệt chỉ trả label thiết bị sau khi đã cấp quyền camera. */
export async function ensureCameraPermission(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
  stream.getTracks().forEach(track => track.stop())
}

export async function resolveMobileCameraDevice(cameraId: string): Promise<string | undefined> {
  await ensureCameraPermission()
  const devices = await listVideoInputDevices()
  if (devices.length === 0) return undefined

  const pattern = MOBILE_DEVICE_LABEL_MATCH[cameraId]
  if (pattern) {
    const matched = devices.find(d => pattern.test(d.label))
    if (matched) return matched.deviceId
  }

  const idx = MOBILE_DEVICE_INDEX[cameraId] ?? 0
  return devices[idx]?.deviceId ?? devices[0]?.deviceId
}

export type CameraFacing = 'user' | 'environment'

export function isHandheldDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
}

export async function buildMobileCaptureConstraints(
  cameraId: string,
  facing: CameraFacing,
  deviceCycleIndex?: number,
): Promise<MediaTrackConstraints> {
  await ensureCameraPermission()
  const devices = await listVideoInputDevices()

  if (isHandheldDevice()) {
    return { facingMode: { ideal: facing } }
  }

  if (devices.length > 1 && deviceCycleIndex !== undefined) {
    const idx = deviceCycleIndex % devices.length
    return { deviceId: { exact: devices[idx].deviceId } }
  }

  const deviceId = await resolveMobileCameraDevice(cameraId)
  if (deviceId) return { deviceId: { exact: deviceId } }
  return { facingMode: { ideal: facing } }
}

export function getFacingLabel(facing: CameraFacing): string {
  return facing === 'user' ? 'Trước' : 'Sau'
}

export function getResolvedDeviceLabel(
  cameraId: string,
  devices: MediaDeviceInfo[],
): string | undefined {
  const pattern = MOBILE_DEVICE_LABEL_MATCH[cameraId]
  if (pattern) {
    const matched = devices.find(d => pattern.test(d.label))
    if (matched?.label) return matched.label
  }
  const idx = MOBILE_DEVICE_INDEX[cameraId] ?? 0
  return devices[idx]?.label || devices[0]?.label
}
