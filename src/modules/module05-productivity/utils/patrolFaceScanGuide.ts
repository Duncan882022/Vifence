/**
 * Hướng dẫn quét mặt eKYC — 4 góc gallery: chính diện, trái, phải, cúi xuống.
 */

import {
  faceScanPoseLabel,
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
}

const FACE_SCORE_MIN = 0.32
const DETECT_WIDTH = 480
const YAW_SIDE = 0.08
const YAW_TURN = 0.11
const FILL_MIN = 0.10
const FILL_MAX = 0.72
const CENTER_X_MIN = 0.2
const CENTER_X_MAX = 0.8
const CENTER_Y_MIN = 0.18
const CENTER_Y_MAX = 0.82
const PITCH_DOWN_Y = 0.54

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

function drawVideoSampleMirrored(video: HTMLVideoElement): HTMLCanvasElement | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh || video.readyState < 2) return null
  const ctx = getSampleCtx()
  const canvas = ctx.canvas
  canvas.width = DETECT_WIDTH
  canvas.height = Math.round(DETECT_WIDTH / (vw / vh))
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

function classifyHeadPose(cx: number, cy: number): HeadPoseHint {
  const dx = cx - 0.5
  if (cy >= PITCH_DOWN_Y && Math.abs(dx) <= YAW_SIDE + 0.06) return 'down'
  if (dx <= -YAW_TURN) return 'left'
  if (dx >= YAW_TURN) return 'right'
  if (Math.abs(dx) <= YAW_SIDE && cy <= PITCH_DOWN_Y - 0.04) return 'front'
  if (cy <= 0.4 && Math.abs(dx) <= YAW_SIDE) return 'up'
  return dx < 0 ? 'left' : 'right'
}

export function faceLooseInFrame(metrics: FaceScanMetrics): boolean {
  if (!metrics.hasFace) return false
  if (metrics.poseHint === 'too_far' || metrics.poseHint === 'too_close') return false
  return faceInOval(metrics.centerX, metrics.centerY, metrics.fillScore * FILL_MAX)
}

export function faceReadyForManualCapture(
  metrics: FaceScanMetrics,
  modelAvailable: boolean,
): boolean {
  if (!modelAvailable) return true
  return faceLooseInFrame(metrics)
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
      return slot === 1 ? 'Hạ cằm về — nhìn thẳng Chính diện, không ngửa đầu' : `Cúi cằm nhẹ — cần ${target}`
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

  const poseHint = classifyHeadPose(cx, cy)
  return { hasFace: true, poseHint, fillScore, centerX: cx, centerY: cy }
}

export function getPatrolFaceScanModelStatus(): FaceScanModelStatus {
  return modelStatus
}

export function preloadPatrolFaceScanModels(): void {
  void loadBlazeFace()
}

const HINT_SAMPLE_CENTERS: Partial<Record<HeadPoseHint, { centerX: number; centerY: number }>> = {
  front: { centerX: 0.5, centerY: 0.5 },
  left: { centerX: 0.34, centerY: 0.5 },
  right: { centerX: 0.66, centerY: 0.5 },
  down: { centerX: 0.5, centerY: 0.62 },
}

export function poseHintMatchesSlot(hint: HeadPoseHint, slot: ScanPoseSlot): boolean {
  const sample = HINT_SAMPLE_CENTERS[hint] ?? { centerX: 0.5, centerY: 0.5 }
  return faceReadyForSlot(
    { hasFace: true, poseHint: hint, fillScore: 1, centerX: sample.centerX, centerY: sample.centerY },
    slot,
  )
}
