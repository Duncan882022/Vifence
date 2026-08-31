/**
 * Hướng dẫn quét mặt eKYC — 5 góc gallery: chính diện, trái, phải, cúi, ngửa.
 */

import {
  isHandheldDevice,
} from '@/modules/module02-training/services/deviceCamera.service'
import {
  faceScanPoseLabel,
  guidanceForSlot,
  type ScanPoseSlot,
} from './patrolFaceScanPoses'

export type { ScanPoseSlot } from './patrolFaceScanPoses'
export {
  FACE_SCAN_POSE_COUNT,
  FACE_SCAN_POSE_LABELS,
  guidanceForSlot,
} from './patrolFaceScanPoses'

export type HeadPoseHint =
  | 'no_face'
  | 'too_far'
  | 'too_close'
  | 'off_center'
  | 'front'
  | 'left'
  | 'right'
  | 'up'
  | 'down'

export type FaceScanModelStatus = 'loading' | 'ready' | 'unavailable'

export interface FaceScanMetrics {
  hasFace: boolean
  poseHint: HeadPoseHint
  fillScore: number
  centerX: number
  centerY: number
  /** fh/fw — ngửa lên thường làm bbox cao hơn (BlazeFace). */
  faceAspect?: number
}

const FACE_SCORE_MIN = 0.28
const DETECT_WIDTH_DESKTOP = 480
const DETECT_WIDTH_MOBILE = 320
const YAW_SIDE = 0.09
const YAW_TURN = 0.10
const YAW_TURN_NEAR = 0.07
const FILL_MIN = 0.10
const FILL_MAX = 0.72
const CENTER_X_MIN = 0.2
const CENTER_X_MAX = 0.8
const CENTER_Y_MIN = 0.18
const CENTER_Y_MAX = 0.82
const PITCH_DOWN_Y = 0.54
/** cy thấp hơn = mặt lên trên khung (ngửa cằm). Nới so v0.39 — BlazeFace ít dịch bbox. */
const PITCH_UP_Y = 0.46
const PITCH_UP_ASPECT = 1.12
const AUTO_POSE_MATCH_THRESHOLD_UP = 0.55

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
      if (isHandheldDevice()) {
        await tf.setBackend('cpu')
      } else if (tf.findBackend('webgl')) {
        await tf.setBackend('webgl')
      } else {
        await tf.setBackend('cpu')
      }
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

function drawVideoSampleMirrored(video: HTMLVideoElement): HTMLCanvasElement | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh || video.readyState < 2) return null
  const ctx = getSampleCtx()
  const canvas = ctx.canvas
  canvas.width = isHandheldDevice() ? DETECT_WIDTH_MOBILE : DETECT_WIDTH_DESKTOP
  canvas.height = Math.round(canvas.width / (vw / vh))
  ctx.save()
  ctx.translate(canvas.width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  ctx.restore()
  return canvas
}

function faceInOval(cx: number, cy: number, fw: number): boolean {
  if (cx < CENTER_X_MIN || cx > CENTER_X_MAX) return false
  if (cy < CENTER_Y_MIN || cy > CENTER_Y_MAX) return false
  return fw >= FILL_MIN * 0.7
}

function looksLikeUpPose(metrics: FaceScanMetrics): boolean {
  const { centerX: cx, centerY: cy, faceAspect = 1 } = metrics
  if (Math.abs(cx - 0.5) > YAW_SIDE + 0.10) return false
  if (metrics.poseHint === 'up') return true
  if (cy <= PITCH_UP_Y + 0.02) return true
  if (faceAspect >= PITCH_UP_ASPECT && cy <= 0.50) return true
  return false
}

function classifyHeadPose(cx: number, cy: number, faceAspect = 1): HeadPoseHint {
  const dx = cx - 0.5
  if (cy >= PITCH_DOWN_Y && Math.abs(dx) <= YAW_SIDE + 0.06) return 'down'
  if (dx <= -YAW_TURN) return 'left'
  if (dx >= YAW_TURN) return 'right'
  const centered = Math.abs(dx) <= YAW_SIDE + 0.08
  if (centered && (cy <= PITCH_UP_Y || (faceAspect >= PITCH_UP_ASPECT && cy <= 0.50))) {
    return 'up'
  }
  if (centered && cy <= PITCH_DOWN_Y - 0.04 && cy > PITCH_UP_Y) return 'front'
  return dx < 0 ? 'left' : 'right'
}

/** Tiến độ 0→1 khi quay đầu về phía góc slot — vòng tròn fill dần như Face ID. */
export function poseApproachProgress(metrics: FaceScanMetrics, slot: ScanPoseSlot): number {
  if (!metrics.hasFace) return 0
  if (metrics.poseHint === 'too_far' || metrics.poseHint === 'too_close') return 0.04

  const { centerX: cx, centerY: cy } = metrics
  let raw = 0

  switch (slot) {
    case 1: {
      const dx = Math.abs(cx - 0.5)
      const dyFront = Math.max(0, cy - (PITCH_DOWN_Y - 0.02))
      const dyUp = Math.max(0, 0.42 - cy)
      raw = 1 - Math.min(1, dx / 0.14 * 0.55 + dyFront / 0.1 * 0.25 + dyUp / 0.08 * 0.2)
      break
    }
    case 2: {
      const target = 0.5 - YAW_TURN
      raw = (0.5 - cx) / Math.max(0.01, 0.5 - target)
      break
    }
    case 3: {
      const target = 0.5 + YAW_TURN
      raw = (cx - 0.5) / Math.max(0.01, target - 0.5)
      break
    }
    case 4: {
      raw = (cy - 0.44) / Math.max(0.01, PITCH_DOWN_Y - 0.44)
      break
    }
    case 5: {
      raw = (PITCH_UP_Y + 0.04 - cy) / Math.max(0.01, PITCH_UP_Y + 0.04 - 0.32)
      break
    }
  }

  if (!faceLooseInFrame(metrics)) raw *= 0.35
  return Math.max(0, Math.min(0.92, raw))
}

const AUTO_POSE_MATCH_THRESHOLD = 0.72

export function faceNearSlot(metrics: FaceScanMetrics, slot: ScanPoseSlot): boolean {
  if (!faceLooseInFrame(metrics)) return false
  const { poseHint, centerX: cx, centerY: cy } = metrics
  switch (slot) {
    case 1:
      return poseHint === 'front'
        || (Math.abs(cx - 0.5) <= YAW_SIDE + 0.05 && cy <= PITCH_DOWN_Y + 0.02)
    case 2:
      return poseHint === 'left' || cx <= 0.5 - YAW_TURN_NEAR
    case 3:
      return poseHint === 'right' || cx >= 0.5 + YAW_TURN_NEAR
    case 4:
      return poseHint === 'down' || cy >= PITCH_DOWN_Y - 0.06
    case 5:
      return looksLikeUpPose(metrics)
    default:
      return false
  }
}

export function faceReadyForAutoSlot(metrics: FaceScanMetrics, slot: ScanPoseSlot): boolean {
  if (!faceLooseInFrame(metrics)) return false
  const threshold = slot === 5 ? AUTO_POSE_MATCH_THRESHOLD_UP : AUTO_POSE_MATCH_THRESHOLD
  return faceNearSlot(metrics, slot)
    || poseApproachProgress(metrics, slot) >= threshold
}

export type AutoScanPhase =
  | 'loading'
  | 'no_face'
  | 'approach'
  | 'hold'
  | 'capture'
  | 'fallback'

/** Hướng dẫn phụ cho chế độ tự động — luôn nói rõ cần quay đi đâu nếu chưa đủ góc. */
export function autoScanInstruction(
  metrics: FaceScanMetrics | null,
  slot: ScanPoseSlot,
  phase: AutoScanPhase,
  holdProgress = 0,
): string {
  return liveScanHint(metrics, slot, phase, holdProgress).text
}

export type LiveScanDirection =
  | 'front'
  | 'left'
  | 'right'
  | 'down'
  | 'up'
  | 'hold'
  | 'closer'
  | 'farther'
  | 'center'
  | 'loading'
  | 'none'

export type LiveScanTone = 'neutral' | 'active' | 'success' | 'warn'

export interface LiveScanHint {
  text: string
  direction: LiveScanDirection
  tone: LiveScanTone
}

function slotLiveDirection(slot: ScanPoseSlot): LiveScanDirection {
  switch (slot) {
    case 2:
      return 'left'
    case 3:
      return 'right'
    case 4:
      return 'down'
    case 5:
      return 'up'
    default:
      return 'front'
  }
}

/** Hint trực tiếp trên camera — chỉ hướng dẫn góc đang quét (góc nhìn người chụp). */
export function liveScanHint(
  metrics: FaceScanMetrics | null,
  slot: ScanPoseSlot,
  phase: AutoScanPhase,
  holdProgress = 0,
): LiveScanHint {
  const slotText = guidanceForSlot(slot)
  const slotDir = slotLiveDirection(slot)

  if (phase === 'loading') {
    return { text: 'Đang tải…', direction: 'loading', tone: 'neutral' }
  }
  if (phase === 'capture') {
    return { text: 'Đang quét…', direction: 'hold', tone: 'success' }
  }
  if (phase === 'hold') {
    return holdProgress >= 1
      ? { text: 'Đang quét…', direction: 'hold', tone: 'success' }
      : { text: 'Giữ yên', direction: 'hold', tone: 'active' }
  }

  if (!metrics?.hasFace && phase === 'no_face') {
    return { text: 'Đưa mặt vào khung tròn', direction: 'center', tone: 'warn' }
  }

  if (metrics && faceReadyForAutoSlot(metrics, slot)) {
    return { text: 'Giữ yên', direction: 'hold', tone: 'success' }
  }

  return { text: slotText, direction: slotDir, tone: 'active' }
}

export function basicFacePresentFromCanvas(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  const w = canvas.width
  const h = canvas.height
  const cx = w * 0.5
  const cy = h * 0.5
  const rx = w * 0.24
  const ry = h * 0.3
  let sum = 0
  let sumSq = 0
  let n = 0
  const data = ctx.getImageData(0, 0, w, h).data
  for (let y = Math.floor(cy - ry); y < cy + ry; y += 3) {
    if (y < 0 || y >= h) continue
    for (let x = Math.floor(cx - rx); x < cx + rx; x += 3) {
      if (x < 0 || x >= w) continue
      const dx = (x - cx) / rx
      const dy = (y - cy) / ry
      if (dx * dx + dy * dy > 1) continue
      const i = (y * w + x) * 4
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      sum += lum
      sumSq += lum * lum
      n++
    }
  }
  if (n < 12) return false
  const mean = sum / n
  const variance = sumSq / n - mean * mean
  const minVariance = isHandheldDevice() ? 28 : 160
  return variance > minVariance && mean > 20 && mean < 248
}

export function basicFacePresentInVideo(video: HTMLVideoElement): boolean {
  const canvas = drawVideoSampleMirrored(video)
  if (!canvas) return false
  return basicFacePresentFromCanvas(canvas)
}

export function faceLooseInFrame(metrics: FaceScanMetrics): boolean {
  if (!metrics.hasFace) return false
  if (metrics.poseHint === 'too_far' || metrics.poseHint === 'too_close') return false
  return faceInOval(metrics.centerX, metrics.centerY, metrics.fillScore * FILL_MAX)
}

export function manualScanBlockedInstruction(modelStatus: FaceScanModelStatus): string {
  switch (modelStatus) {
    case 'loading':
      return 'Đang tải AI nhận diện góc mặt — chờ sẵn sàng rồi mới chụp thủ công.'
    case 'unavailable':
      return 'AI nhận diện góc mặt không khả dụng — tải lại trang hoặc chuyển sang Tự động.'
    default:
      return ''
  }
}

export function faceReadyForManualCapture(
  metrics: FaceScanMetrics,
  slot: ScanPoseSlot,
  modelStatus: FaceScanModelStatus,
): boolean {
  if (modelStatus !== 'ready') return false
  return faceReadyForSlot(metrics, slot)
}

export function faceReadyForSlot(metrics: FaceScanMetrics, slot: ScanPoseSlot): boolean {
  if (!metrics.hasFace) return false
  if (metrics.poseHint === 'too_far' || metrics.poseHint === 'too_close' || metrics.poseHint === 'off_center') {
    return false
  }
  if (!faceInOval(metrics.centerX, metrics.centerY, metrics.fillScore * FILL_MAX)) return false

  switch (slot) {
    case 1:
      return metrics.poseHint === 'front'
    case 2:
      return metrics.poseHint === 'left'
    case 3:
      return metrics.poseHint === 'right'
    case 4:
      return metrics.poseHint === 'down'
    case 5:
      return looksLikeUpPose(metrics)
    default:
      return false
  }
}

export function guidanceForHint(hint: HeadPoseHint, slot: ScanPoseSlot): string {
  const target = faceScanPoseLabel(slot)

  switch (hint) {
    case 'no_face':
      return `Đưa mặt vào giữa khung — cần góc ${target}`
    case 'too_far':
      return 'Tiến lại gần — mặt hơi xa camera'
    case 'too_close':
      return 'Lùi xa một chút — mặt quá gần'
    case 'off_center':
      return `Căn mặt vào giữa khung — đang quét ${target}`
    case 'front':
      if (slot === 1) return 'Giữ yên — đang quét Chính diện…'
      if (slot === 2) return 'Quay mặt sang trái — cần góc Quay trái'
      if (slot === 3) return 'Quay mặt sang phải — cần góc Quay phải'
      return 'Cúi cằm nhẹ — cần góc Cúi xuống'
    case 'left':
      return slot === 2 ? 'Giữ yên — đang quét Quay trái…' : `Quay sang trái thêm — cần ${target}`
    case 'right':
      return slot === 3 ? 'Giữ yên — đang quét Quay phải…' : `Quay sang phải thêm — cần ${target}`
    case 'up':
      if (slot === 5) return 'Giữ yên — đang quét Ngửa lên…'
      if (slot === 1) return 'Hạ cằm về — nhìn thẳng Chính diện'
      return `Ngửa cằm nhẹ — cần ${target}`
    case 'down':
      return slot === 4 ? 'Giữ yên — đang quét Cúi xuống…' : `Cúi cằm thêm — cần ${target}`
    default:
      return `Căn mặt theo góc ${target}`
  }
}

export async function analyzeFaceScanFrame(video: HTMLVideoElement): Promise<FaceScanMetrics> {
  const empty: FaceScanMetrics = {
    hasFace: false,
    poseHint: 'no_face',
    fillScore: 0,
    centerX: 0.5,
    centerY: 0.5,
    faceAspect: 1,
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

  const faceAspect = fh / Math.max(fw, 0.01)

  if (fw < FILL_MIN) {
    return { hasFace: true, poseHint: 'too_far', fillScore, centerX: cx, centerY: cy, faceAspect }
  }
  if (fw > FILL_MAX) {
    return { hasFace: true, poseHint: 'too_close', fillScore, centerX: cx, centerY: cy, faceAspect }
  }
  if (!faceInOval(cx, cy, fw)) {
    return { hasFace: true, poseHint: 'off_center', fillScore, centerX: cx, centerY: cy, faceAspect }
  }

  const poseHint = classifyHeadPose(cx, cy, faceAspect)
  return { hasFace: true, poseHint, fillScore, centerX: cx, centerY: cy, faceAspect }
}

export function getPatrolFaceScanModelStatus(): FaceScanModelStatus {
  return modelStatus
}

export function preloadPatrolFaceScanModels(): void {
  void loadBlazeFace()
}

const HINT_SAMPLE_CENTERS: Partial<Record<HeadPoseHint, { centerX: number; centerY: number }>> = {
  front: { centerX: 0.5, centerY: 0.48 },
  left: { centerX: 0.34, centerY: 0.5 },
  right: { centerX: 0.66, centerY: 0.5 },
  down: { centerX: 0.5, centerY: 0.62 },
  up: { centerX: 0.5, centerY: 0.42 },
}

export function poseHintMatchesSlot(hint: HeadPoseHint, slot: ScanPoseSlot): boolean {
  const sample = HINT_SAMPLE_CENTERS[hint] ?? { centerX: 0.5, centerY: 0.5 }
  const aspect = hint === 'up' ? 1.15 : 1
  return faceReadyForSlot(
    {
      hasFace: true,
      poseHint: hint,
      fillScore: 1,
      centerX: sample.centerX,
      centerY: sample.centerY,
      faceAspect: aspect,
    },
    slot,
  )
}
