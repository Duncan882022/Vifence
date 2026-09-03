/** Canvas + cache dùng chung theo từng thẻ video — tránh tạo canvas mới mỗi lần AI chụp frame. */
import type { VideoSourceRect } from './videoOverlayCoords'

interface VideoCaptureState {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  lastAt: number
  cacheKey: string
  lastBase64: string | null
}

const captureStateByVideo = new WeakMap<HTMLVideoElement, VideoCaptureState>()
const analyzeIntervalScaleByVideo = new WeakMap<HTMLVideoElement, number>()

/** Khoảng cách tối thiểu giữa 2 lần drawImage thực sự (ms). */
const MIN_CAPTURE_GAP_MS = 64
/** HC patrol — frame mới thường xuyên hơn để ROI bám video. */
const PATROL_CAPTURE_GAP_MS = 40

export function invalidateVideoFrameCapture(video: HTMLVideoElement): void {
  const state = captureStateByVideo.get(video)
  if (!state) return
  state.lastAt = 0
  state.lastBase64 = null
}

export function setVideoAnalyzeIntervalScale(video: HTMLVideoElement, scale: number): void {
  analyzeIntervalScaleByVideo.set(video, Math.max(1, scale))
}

export function getVideoAnalyzeIntervalScale(video: HTMLVideoElement): number {
  return analyzeIntervalScaleByVideo.get(video) ?? 1
}

export function scaledAnalyzeDelay(video: HTMLVideoElement, delayMs: number): number {
  return Math.round(delayMs * getVideoAnalyzeIntervalScale(video))
}

/**
 * Luôn là khung hình đầy đủ.
 *
 * Trước đây chỗ này cắt theo vùng `object-cover` còn nhìn thấy. Làm vậy khiến
 * ảnh gửi đi mang một hệ toạ độ riêng: backend đo polygon ROI 0–1 trên mảnh đã
 * cắt trong khi FE vẽ chúng trên khung đầy đủ, và bbox trả về cũng khác hệ với
 * bbox của luồng VMS dù hai nguồn đổ vào chung một overlay.
 */
function resolveCaptureRegion(video: HTMLVideoElement): VideoSourceRect {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: 0, y: 0, width: w, height: h }
}

export function captureVideoFrameBase64(
  video: HTMLVideoElement,
  maxWidth = 480,
  quality = 0.52,
  minCaptureGapMs = MIN_CAPTURE_GAP_MS,
): string | null {
  const region = resolveCaptureRegion(video)
  if (region.width <= 0 || region.height <= 0) return null

  const cacheKey = `${maxWidth}:${quality}:${Math.round(region.x)}:${Math.round(region.y)}:${Math.round(region.width)}:${Math.round(region.height)}`
  const now = performance.now()
  let state = captureStateByVideo.get(video)

  if (
    state
    && state.cacheKey === cacheKey
    && state.lastBase64
    && now - state.lastAt < minCaptureGapMs
  ) {
    return state.lastBase64
  }

  const scale = region.width > maxWidth ? maxWidth / region.width : 1
  const cw = Math.max(1, Math.round(region.width * scale))
  const ch = Math.max(1, Math.round(region.height * scale))

  if (!state) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    state = { canvas, ctx, lastAt: 0, cacheKey: '', lastBase64: null }
    captureStateByVideo.set(video, state)
  }

  if (state.canvas.width !== cw || state.canvas.height !== ch) {
    state.canvas.width = cw
    state.canvas.height = ch
  }

  state.ctx.drawImage(
    video,
    region.x, region.y, region.width, region.height,
    0, 0, cw, ch,
  )
  const dataUrl = state.canvas.toDataURL('image/jpeg', quality)
  const comma = dataUrl.indexOf(',')
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : null

  state.lastAt = now
  state.cacheKey = cacheKey
  state.lastBase64 = base64
  return base64
}

/** Gửi full frame — ROI backend dùng polygon 0–1 trên khung gốc; overlay map qua mapBackendBboxToOverlay. */
export function captureCameraAnalyzeFrame(
  video: HTMLVideoElement,
  cameraId: string,
  maxWidth = 640,
  quality = 0.72,
): string | null {
  const isPatrolHelmet = cameraId.startsWith('HC-')
  return captureVideoFrameBase64(
    video,
    maxWidth,
    quality,
    isPatrolHelmet ? PATROL_CAPTURE_GAP_MS : MIN_CAPTURE_GAP_MS,
  )
}
