/** Canvas + cache dùng chung theo từng thẻ video — tránh tạo canvas mới mỗi lần AI chụp frame. */
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
const MIN_CAPTURE_GAP_MS = 160

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

export function captureVideoFrameBase64(
  video: HTMLVideoElement,
  maxWidth = 480,
  quality = 0.52,
): string | null {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return null

  const cacheKey = `${maxWidth}:${quality}`
  const now = performance.now()
  let state = captureStateByVideo.get(video)

  if (
    state
    && state.cacheKey === cacheKey
    && state.lastBase64
    && now - state.lastAt < MIN_CAPTURE_GAP_MS
  ) {
    return state.lastBase64
  }

  const scale = w > maxWidth ? maxWidth / w : 1
  const cw = Math.round(w * scale)
  const ch = Math.round(h * scale)

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

  state.ctx.drawImage(video, 0, 0, cw, ch)
  const dataUrl = state.canvas.toDataURL('image/jpeg', quality)
  const comma = dataUrl.indexOf(',')
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : null

  state.lastAt = now
  state.cacheKey = cacheKey
  state.lastBase64 = base64
  return base64
}
