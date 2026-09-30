/**
 * Bản sao video phiên trên CMS: vẽ khung hình H1 lên canvas rồi ghi bằng MediaRecorder.
 * Qua canvas nên WHEP kết nối lại (MediaStream mới) hay HLS trên Safari vẫn ghi liền mạch.
 * Bản gốc vẫn là bản ghi trên H1 / MediaMTX.
 */
const FPS = 12
const WIDTH = 1280
const HEIGHT = 720

function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m))
}

export function isSessionCaptureSupported(): boolean {
  return Boolean(pickMime()) && typeof HTMLCanvasElement.prototype.captureStream === 'function'
}

class SessionRecorder {
  private canvas = document.createElement('canvas')
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private timer = 0
  private hasFrame = false
  readonly mime: string

  constructor(private getVideo: () => HTMLVideoElement | null, private overlay: () => string) {
    this.mime = pickMime() ?? 'video/webm'
    this.canvas.width = WIDTH
    this.canvas.height = HEIGHT
  }

  private draw = () => {
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    const video = this.getVideo()
    if (video && video.readyState >= 2 && video.videoWidth > 0) {
      const scale = Math.min(WIDTH / video.videoWidth, HEIGHT / video.videoHeight)
      const w = video.videoWidth * scale
      const h = video.videoHeight * scale
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
      try {
        ctx.drawImage(video, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h)
        this.hasFrame = true
      } catch { /* khung hình chưa sẵn */ }
    } else if (this.hasFrame) {
      // Giữ khung hình cuối — H1 vẫn ghi bản gốc, CMS chỉ mất live view.
      ctx.fillStyle = 'rgba(245,158,11,0.9)'
      ctx.fillRect(16, 16, 150, 32)
      ctx.fillStyle = '#000'
      ctx.font = 'bold 18px sans-serif'
      ctx.fillText('NO SIGNAL', 30, 39)
    } else {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
      ctx.fillStyle = '#94a3b8'
      ctx.font = 'bold 28px sans-serif'
      ctx.fillText('ĐANG CHỜ TÍN HIỆU H1...', 60, HEIGHT / 2)
    }
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, HEIGHT - 36, WIDTH, 36)
    ctx.fillStyle = '#fff'
    ctx.font = '18px monospace'
    ctx.fillText(this.overlay(), 16, HEIGHT - 12)
  }

  start() {
    const stream = this.canvas.captureStream(FPS)
    this.recorder = new MediaRecorder(stream, { mimeType: this.mime, videoBitsPerSecond: 1_500_000 })
    this.recorder.ondataavailable = e => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.draw()
    this.timer = window.setInterval(this.draw, 1000 / FPS)
    this.recorder.start(2000)
  }

  pause() {
    if (this.recorder?.state === 'recording') this.recorder.pause()
  }

  resume() {
    if (this.recorder?.state === 'paused') this.recorder.resume()
  }

  stop(): Promise<Blob | null> {
    window.clearInterval(this.timer)
    const rec = this.recorder
    if (!rec || rec.state === 'inactive') return Promise.resolve(this.chunks.length ? new Blob(this.chunks, { type: this.mime }) : null)
    return new Promise(resolve => {
      rec.onstop = () => resolve(this.chunks.length ? new Blob(this.chunks, { type: this.mime }) : null)
      rec.stop()
    })
  }
}

const active = new Map<string, SessionRecorder>()

export function startSessionCapture(sessionId: string, getVideo: () => HTMLVideoElement | null, overlay: () => string): boolean {
  if (active.has(sessionId)) return true
  if (!isSessionCaptureSupported()) return false
  try {
    const rec = new SessionRecorder(getVideo, overlay)
    rec.start()
    active.set(sessionId, rec)
    return true
  } catch {
    return false
  }
}

export function hasSessionCapture(sessionId: string): boolean {
  return active.has(sessionId)
}

export function pauseSessionCapture(sessionId: string) {
  active.get(sessionId)?.pause()
}

export function resumeSessionCapture(sessionId: string) {
  active.get(sessionId)?.resume()
}

export async function stopSessionCapture(sessionId: string): Promise<{ blob: Blob; mime: string } | null> {
  const rec = active.get(sessionId)
  if (!rec) return null
  active.delete(sessionId)
  const blob = await rec.stop()
  return blob ? { blob, mime: rec.mime } : null
}

/** §12 SNAPSHOT — khung hình hiện tại của live feed. */
export function captureFrame(video: HTMLVideoElement | null, quality = 0.88): Promise<Blob | null> {
  if (!video || video.videoWidth === 0) return Promise.resolve(null)
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  try {
    ctx.drawImage(video, 0, 0)
  } catch {
    return Promise.resolve(null)
  }
  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', quality))
}
