import {
  isDeviceCameraSupported,
  isHandheldDevice,
} from '@/modules/module02-training/services/deviceCamera.service'

export type FaceScanCameraErrorCode = 'unsupported' | 'insecure' | 'denied' | 'failed'

export function faceScanCameraErrorMessage(code: FaceScanCameraErrorCode): string {
  switch (code) {
    case 'unsupported':
      return 'Trình duyệt không hỗ trợ camera trên thiết bị này.'
    case 'insecure':
      return 'Camera chỉ hoạt động trên HTTPS. Mở trang qua https://…'
    case 'denied':
      return 'Quyền camera bị chặn. iPhone: Cài đặt → Safari → Camera → Cho phép, rồi bấm «Bật camera» bên dưới.'
    default:
      return 'Không mở được camera — bấm «Bật camera» để thử lại.'
  }
}

export function isFaceScanStreamLive(stream: MediaStream | null | undefined): boolean {
  return Boolean(stream?.getVideoTracks().some(track => track.readyState === 'live'))
}

function classifyCameraError(err: unknown): FaceScanCameraErrorCode {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'denied'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'failed'
  return 'failed'
}

function shouldRetryConstraint(err: unknown): boolean {
  const name = err instanceof DOMException ? err.name : ''
  return name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError'
}

function faceScanCameraConstraints(): MediaStreamConstraints[] {
  if (isHandheldDevice()) {
    return [
      { video: { facingMode: { ideal: 'user' } }, audio: false },
      { video: true, audio: false },
    ]
  }
  return [
    { video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: { facingMode: { ideal: 'user' } }, audio: false },
    { video: true, audio: false },
  ]
}

export async function openFaceScanCameraStream(): Promise<MediaStream> {
  if (!isDeviceCameraSupported()) {
    throw Object.assign(new Error('unsupported'), { code: 'unsupported' satisfies FaceScanCameraErrorCode })
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw Object.assign(new Error('insecure'), { code: 'insecure' satisfies FaceScanCameraErrorCode })
  }

  const attempts = faceScanCameraConstraints()
  let lastErr: unknown = null

  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (err) {
      lastErr = err
      const code = classifyCameraError(err)
      if (code === 'denied') {
        throw Object.assign(err instanceof Error ? err : new Error('denied'), { code: 'denied' satisfies FaceScanCameraErrorCode })
      }
      if (!shouldRetryConstraint(err)) break
    }
  }

  const code = classifyCameraError(lastErr)
  throw Object.assign(lastErr instanceof Error ? lastErr : new Error('failed'), { code })
}

export async function attachFaceScanStreamToVideo(
  video: HTMLVideoElement,
  stream: MediaStream,
): Promise<void> {
  if (video.srcObject !== stream) {
    video.setAttribute('playsinline', 'true')
    video.setAttribute('webkit-playsinline', 'true')
    video.muted = true
    video.srcObject = stream
  }
  if (video.paused) {
    await video.play().catch(() => {})
  }
}

export function stopFaceScanStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach(track => track.stop())
}
