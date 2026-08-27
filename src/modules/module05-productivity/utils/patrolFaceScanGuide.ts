/**
 * Hướng dẫn quét mặt tự động — kiểu eKYC: đưa mặt vào khung, giữ yên, hệ thống tự quét.
 * Phân tích trên khung đã mirror để khớp preview camera trước (scale-x-[-1]).
 */

export type ScanPoseSlot = 1 | 2 | 3

export type HeadPoseHint =
  | 'no_face'
  | 'too_far'
  | 'too_close'
  | 'off_center'
  | 'front'
  | 'left'
  | 'right'

export type FaceScanModelStatus = 'loading' | 'ready' | 'unavailable'

export interface FaceScanMetrics {
  hasFace: boolean
  poseHint: HeadPoseHint
  /** 0–1 — mức lấp đầy khung oval */
  fillScore: number
  /** Tâm mặt chuẩn hoá [0,1] — đã mirror khớp preview */
  centerX: number
  centerY: number
}

const FACE_SCORE_MIN = 0.35
const DETECT_WIDTH = 480

/** Ngưỡng lệch ngang — nới rộng cho dễ quét. */
const YAW_FRONT = 0.14
const YAW_SIDE = 0.06

const FILL_MIN = 0.14
const FILL_MAX = 0.68
const CENTER_X_MIN = 0.22
const CENTER_X_MAX = 0.78
const CENTER_Y_MIN = 0.2
const CENTER_Y_MAX = 0.8

type BlazeFaceModel = {
  estimateFaces: (
    input: HTMLCanvasElement,
    returnTensors?: boolean,
  ) => Promise<
    Array<{
      topLeft: [number, number]
      bottomRight: [number, number]
      probability: number | number[]
    }>
  >
}

let blazePromise: Promise<BlazeFaceModel | null> | null = null
let modelStatus: FaceScanModelStatus = 'loading'
let sampleCanvas: HTMLCanvasElement | null = null
let sampleCtx: CanvasRenderingContext2D | null = null

async function loadBlazeFace(): Promise<BlazeFaceModel | null> {
  if (blazePromise) return blazePromise
  modelStatus = 'loading'
  blazePromise = (async () => {
    try {
      const tf = await import('@tensorflow/tfjs')
      if (tf.findBackend('webgl')) await tf.setBackend('webgl')
      else await tf.setBackend('cpu')
      await tf.ready()
      const blazeface = await import('@tensorflow-models/blazeface')
      const model = (await blazeface.load({ maxFaces: 1 })) as BlazeFaceModel
      modelStatus = 'ready'
      return model
    } catch {
      modelStatus = 'unavailable'
      return null
    }
  })()
  return blazePromise
}

function getSampleCtx(): CanvasRenderingContext2D {
  if (!sampleCanvas) {
    sampleCanvas = document.createElement('canvas')
    sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true })
  }
  if (!sampleCtx) throw new Error('Canvas 2D unavailable')
  return sampleCtx
}

/** Vẽ frame mirror ngang — khớp preview camera trước trên màn hình. */
function drawVideoSampleMirrored(video: HTMLVideoElement): HTMLCanvasElement | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh || video.readyState < 2) return null
  const ctx = getSampleCtx()
  const canvas = ctx.canvas
  const aspect = vw / vh
  canvas.width = DETECT_WIDTH
  canvas.height = Math.round(DETECT_WIDTH / aspect)
  ctx.save()
  ctx.translate(canvas.width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  ctx.restore()
  return canvas
}

function classifyHeadPose(centerX: number): Exclude<HeadPoseHint, 'no_face' | 'too_far' | 'too_close' | 'off_center'> {
  const dx = centerX - 0.5
  if (dx <= -YAW_FRONT) return 'left'
  if (dx >= YAW_FRONT) return 'right'
  if (Math.abs(dx) <= YAW_SIDE) return 'front'
  return dx < 0 ? 'left' : 'right'
}

/** Kiểm tra mặt nằm trong vùng oval (chuẩn hoá 0–1). */
function faceInOval(cx: number, cy: number, fw: number): boolean {
  if (cx < CENTER_X_MIN || cx > CENTER_X_MAX) return false
  if (cy < CENTER_Y_MIN || cy > CENTER_Y_MAX) return false
  return fw >= FILL_MIN * 0.75
}

export function poseHintMatchesSlot(hint: HeadPoseHint, slot: ScanPoseSlot): boolean {
  return faceReadyForSlot(
    { hasFace: true, poseHint: hint, fillScore: 1, centerX: 0.5, centerY: 0.5 },
    slot,
  )
}

/**
 * eKYC-style: bước 1 chỉ cần mặt trong khung; bước 2/3 nới lỏng góc quay.
 */
export function faceReadyForSlot(metrics: FaceScanMetrics, slot: ScanPoseSlot): boolean {
  if (!metrics.hasFace) return false
  if (metrics.poseHint === 'too_far' || metrics.poseHint === 'too_close') return false

  const inOval = faceInOval(metrics.centerX, metrics.centerY, metrics.fillScore * FILL_MAX)

  if (slot === 1) {
    return inOval && (
      metrics.poseHint === 'front'
      || metrics.poseHint === 'off_center'
      || Math.abs(metrics.centerX - 0.5) < 0.2
    )
  }

  if (slot === 2) {
    return inOval && (
      metrics.poseHint === 'left'
      || metrics.centerX < 0.46
    )
  }

  return inOval && (
    metrics.poseHint === 'right'
    || metrics.centerX > 0.54
  )
}

export function guidanceForHint(hint: HeadPoseHint, slot: ScanPoseSlot): string {
  switch (hint) {
    case 'no_face':
      return 'Đưa mặt vào giữa khung tròn'
    case 'too_far':
      return 'Tiến lại gần camera một chút'
    case 'too_close':
      return 'Lùi xa camera một chút'
    case 'off_center':
      return 'Căn mặt vào giữa khung tròn'
    case 'front':
      return slot === 1 ? 'Giữ yên — đang quét…' : slot === 2 ? 'Từ từ quay sang TRÁI' : 'Từ từ quay sang PHẢI'
    case 'left':
      return slot === 2 ? 'Giữ yên — đang quét…' : 'Quay chậm sang TRÁI'
    case 'right':
      return slot === 3 ? 'Giữ yên — đang quét…' : 'Quay chậm sang PHẢI'
    default:
      return 'Đưa mặt vào giữa khung tròn'
  }
}

export function guidanceForSlot(slot: ScanPoseSlot): string {
  if (slot === 1) return 'Bước 1: Nhìn thẳng vào camera'
  if (slot === 2) return 'Bước 2: Quay chậm sang TRÁI'
  return 'Bước 3: Quay chậm sang PHẢI'
}

export async function analyzeFaceScanFrame(video: HTMLVideoElement): Promise<FaceScanMetrics> {
  const empty: FaceScanMetrics = {
    hasFace: false,
    poseHint: 'no_face',
    fillScore: 0,
    centerX: 0.5,
    centerY: 0.5,
  }

  const canvas = drawVideoSampleMirrored(video)
  if (!canvas) return empty

  const model = await loadBlazeFace()
  if (!model) return empty

  let faces: Awaited<ReturnType<BlazeFaceModel['estimateFaces']>>
  try {
    faces = await model.estimateFaces(canvas, false)
  } catch {
    return empty
  }

  if (!faces.length) return empty

  let best = faces[0]
  let bestScore = 0
  for (const f of faces) {
    const prob = Array.isArray(f.probability) ? f.probability[0] : f.probability
    if (prob > bestScore) {
      bestScore = prob
      best = f
    }
  }
  if (bestScore < FACE_SCORE_MIN) return empty

  const [x1, y1] = best.topLeft
  const [x2, y2] = best.bottomRight
  const w = canvas.width
  const h = canvas.height
  const fw = (x2 - x1) / w
  const fh = (y2 - y1) / h
  const cx = ((x1 + x2) / 2) / w
  const cy = ((y1 + y2) / 2) / h
  const fillScore = Math.min(1, (fw / FILL_MAX) * 0.85 + (fh / 0.55) * 0.15)

  if (fw < FILL_MIN) {
    return { hasFace: true, poseHint: 'too_far', fillScore, centerX: cx, centerY: cy }
  }
  if (fw > FILL_MAX) {
    return { hasFace: true, poseHint: 'too_close', fillScore, centerX: cx, centerY: cy }
  }
  if (!faceInOval(cx, cy, fw)) {
    return { hasFace: true, poseHint: 'off_center', fillScore, centerX: cx, centerY: cy }
  }

  const poseHint = classifyHeadPose(cx)
  return { hasFace: true, poseHint, fillScore, centerX: cx, centerY: cy }
}

export function getPatrolFaceScanModelStatus(): FaceScanModelStatus {
  return modelStatus
}

export function preloadPatrolFaceScanModels(): void {
  void loadBlazeFace()
}
