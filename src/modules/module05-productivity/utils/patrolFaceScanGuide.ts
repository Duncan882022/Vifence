/**
 * Hướng dẫn quét mặt tự động — công nhân chỉ cần đưa mặt vào khung và quay theo lời dẫn.
 * Ước lượng góc đầu từ vị trí bbox BlazeFace (camera trước).
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

export interface FaceScanMetrics {
  hasFace: boolean
  poseHint: HeadPoseHint
  /** 0–1 — mức lấp đầy khung oval */
  fillScore: number
  /** Tâm mặt chuẩn hoá [0,1] */
  centerX: number
  centerY: number
}

const FACE_SCORE_MIN = 0.55
const DETECT_WIDTH = 480

/** Ngưỡng lệch ngang so với giữa khung (camera trước). */
const YAW_FRONT = 0.07
const YAW_LEFT = 0.11
const YAW_RIGHT = 0.11

const FILL_MIN = 0.22
const FILL_MAX = 0.52
const CENTER_Y_MIN = 0.28
const CENTER_Y_MAX = 0.72

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
let sampleCanvas: HTMLCanvasElement | null = null
let sampleCtx: CanvasRenderingContext2D | null = null

async function loadBlazeFace(): Promise<BlazeFaceModel | null> {
  if (blazePromise) return blazePromise
  blazePromise = (async () => {
    try {
      const tf = await import('@tensorflow/tfjs')
      if (tf.findBackend('webgl')) await tf.setBackend('webgl')
      else await tf.setBackend('cpu')
      await tf.ready()
      const blazeface = await import('@tensorflow-models/blazeface')
      return (await blazeface.load({ maxFaces: 1 })) as BlazeFaceModel
    } catch {
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

function drawVideoSample(video: HTMLVideoElement): HTMLCanvasElement | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh || video.readyState < 2) return null
  const ctx = getSampleCtx()
  const canvas = ctx.canvas
  const aspect = vw / vh
  canvas.width = DETECT_WIDTH
  canvas.height = Math.round(DETECT_WIDTH / aspect)
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas
}

function classifyHeadPose(centerX: number): Exclude<HeadPoseHint, 'no_face' | 'too_far' | 'too_close' | 'off_center'> {
  const dx = centerX - 0.5
  if (dx <= -YAW_RIGHT) return 'right'
  if (dx >= YAW_LEFT) return 'left'
  if (Math.abs(dx) <= YAW_FRONT) return 'front'
  return dx > 0 ? 'left' : 'right'
}

export function poseHintMatchesSlot(hint: HeadPoseHint, slot: ScanPoseSlot): boolean {
  if (slot === 1) return hint === 'front'
  if (slot === 2) return hint === 'left'
  return hint === 'right'
}

export function guidanceForHint(hint: HeadPoseHint, slot: ScanPoseSlot): string {
  switch (hint) {
    case 'no_face':
      return 'Đưa mặt vào khung tròn'
    case 'too_far':
      return 'Tiến lại gần hơn một chút'
    case 'too_close':
      return 'Lùi xa một chút'
    case 'off_center':
      return 'Căn mặt vào giữa khung'
    case 'front':
      return slot === 1 ? 'Nhìn thẳng — giữ yên' : 'Quay chậm sang TRÁI'
    case 'left':
      return slot === 2 ? 'Giữ nguyên — đang quét…' : 'Quay chậm sang TRÁI'
    case 'right':
      return slot === 3 ? 'Giữ nguyên — đang quét…' : 'Quay chậm sang PHẢI'
    default:
      return 'Đưa mặt vào khung tròn'
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

  const canvas = drawVideoSample(video)
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

  if (fw < FILL_MIN * 0.85) {
    return { hasFace: true, poseHint: 'too_far', fillScore, centerX: cx, centerY: cy }
  }
  if (fw > FILL_MAX * 1.15) {
    return { hasFace: true, poseHint: 'too_close', fillScore, centerX: cx, centerY: cy }
  }
  if (cy < CENTER_Y_MIN || cy > CENTER_Y_MAX) {
    return { hasFace: true, poseHint: 'off_center', fillScore, centerX: cx, centerY: cy }
  }

  const poseHint = classifyHeadPose(cx)
  return { hasFace: true, poseHint, fillScore, centerX: cx, centerY: cy }
}

export function preloadPatrolFaceScanModels(): void {
  void loadBlazeFace()
}
