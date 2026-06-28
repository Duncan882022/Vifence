import type { AiOverlayBox } from '../data/cameraAiOverlayKeyframes'
import type { CameraFeedKey } from '../data/trainingCameraFeeds'
import { getOverlayFitForFeed } from '../data/trainingCameraFeeds'
import { mapVideoRectToOverlay } from '../utils/videoOverlayCoords'

const MAX_TARGETS = 14
const DETECT_WIDTH = 640
const PERSON_SCORE_MIN = 0.2
const FACE_SCORE_MIN = 0.35
const NMS_IOU = 0.42

type BlazeFaceModel = {
  estimateFaces: (
    input: HTMLCanvasElement | HTMLVideoElement,
    returnTensors?: boolean,
  ) => Promise<
    Array<{
      topLeft: [number, number]
      bottomRight: [number, number]
      probability: number | number[]
    }>
  >
}

type CocoSsdModel = {
  detect: (
    input: HTMLCanvasElement | HTMLVideoElement,
    maxNumBoxes?: number,
    minScore?: number,
  ) => Promise<Array<{ bbox: [number, number, number, number]; class: string; score: number }>>
}

interface PixelRect {
  x: number
  y: number
  width: number
  height: number
  score: number
  kind: 'person' | 'face'
}

let cocoPromise: Promise<CocoSsdModel | null> | null = null
let blazePromise: Promise<BlazeFaceModel | null> | null = null
let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null

function getSampleCanvas(): CanvasRenderingContext2D {
  if (!canvas) {
    canvas = document.createElement('canvas')
    ctx = canvas.getContext('2d', { willReadFrequently: true })
  }
  if (!ctx) throw new Error('Canvas 2D unavailable')
  return ctx
}

async function ensureTfBackend(): Promise<void> {
  try {
    await import('@tensorflow/tfjs-backend-webgl')
    const tf = await import('@tensorflow/tfjs-core')
    await tf.setBackend('webgl')
    await tf.ready()
  } catch {
    const tf = await import('@tensorflow/tfjs-core')
    await tf.ready()
  }
}

async function loadCocoSsd(): Promise<CocoSsdModel | null> {
  if (cocoPromise) return cocoPromise
  cocoPromise = (async () => {
    try {
      await ensureTfBackend()
      const coco = await import('@tensorflow-models/coco-ssd')
      return (await coco.load({ base: 'lite_mobilenet_v2' })) as CocoSsdModel
    } catch {
      return null
    }
  })()
  return cocoPromise
}

async function loadBlazeFace(): Promise<BlazeFaceModel | null> {
  if (blazePromise) return blazePromise
  blazePromise = (async () => {
    try {
      await ensureTfBackend()
      const blazeface = await import('@tensorflow-models/blazeface')
      return (await blazeface.load({ maxFaces: MAX_TARGETS })) as BlazeFaceModel
    } catch {
      return null
    }
  })()
  return blazePromise
}

function drawVideoFrame(video: HTMLVideoElement): HTMLCanvasElement | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh || video.readyState < 2) return null

  const sampleCtx = getSampleCanvas()
  const sampleCanvas = sampleCtx.canvas
  const aspect = vw / vh
  const sw = DETECT_WIDTH
  const sh = Math.round(DETECT_WIDTH / aspect)

  sampleCanvas.width = sw
  sampleCanvas.height = sh
  sampleCtx.drawImage(video, 0, 0, sw, sh)
  return sampleCanvas
}

function canvasToVideoRect(
  rect: PixelRect,
  video: HTMLVideoElement,
  sampleW: number,
  sampleH: number,
  fit: 'cover' | 'contain',
): AiOverlayBox | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  const scaleX = vw / sampleW
  const scaleY = vh / sampleH

  const mapped = mapVideoRectToOverlay(
    {
      x: rect.x * scaleX,
      y: rect.y * scaleY,
      width: rect.width * scaleX,
      height: rect.height * scaleY,
    },
    video,
    fit,
  )

  if (mapped.w < 1.5 || mapped.h < 2) return null

  return { ...mapped, label: 'CN' }
}

function rectCenter(r: PixelRect): { x: number; y: number } {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}

function containsPoint(outer: PixelRect, px: number, py: number): boolean {
  return px >= outer.x && px <= outer.x + outer.width && py >= outer.y && py <= outer.y + outer.height
}

function iou(a: PixelRect, b: PixelRect): number {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  if (x2 <= x1 || y2 <= y1) return 0
  const inter = (x2 - x1) * (y2 - y1)
  const union = a.width * a.height + b.width * b.height - inter
  return union > 0 ? inter / union : 0
}

/** Loại box trùng — ưu tiên person > face, score cao hơn. */
function dedupeRects(rects: PixelRect[]): PixelRect[] {
  const sorted = [...rects].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'person' ? -1 : 1
    return b.score - a.score
  })

  const kept: PixelRect[] = []
  for (const r of sorted) {
    const overlap = kept.some(k => iou(k, r) > NMS_IOU)
    if (!overlap) kept.push(r)
  }
  return kept.slice(0, MAX_TARGETS)
}

async function detectPersons(
  model: CocoSsdModel,
  sampleCanvas: HTMLCanvasElement,
): Promise<PixelRect[]> {
  const preds = await model.detect(sampleCanvas, MAX_TARGETS, PERSON_SCORE_MIN)
  return preds
    .filter(p => p.class === 'person' && p.score >= PERSON_SCORE_MIN)
    .map(p => ({
      x: p.bbox[0],
      y: p.bbox[1],
      width: p.bbox[2],
      height: p.bbox[3],
      score: p.score,
      kind: 'person' as const,
    }))
}

async function detectFaces(
  model: BlazeFaceModel,
  sampleCanvas: HTMLCanvasElement,
): Promise<PixelRect[]> {
  const faces = await model.estimateFaces(sampleCanvas, false)
  const rects: PixelRect[] = []

  for (const f of faces) {
    const [x1, y1] = f.topLeft
    const [x2, y2] = f.bottomRight
    const prob = Array.isArray(f.probability) ? f.probability[0] : f.probability
    if (prob < FACE_SCORE_MIN) continue
    const w = x2 - x1
    const h = y2 - y1
    rects.push({
      x: x1 - w * 0.15,
      y: y1 - h * 0.2,
      width: w * 1.3,
      height: h * 1.45,
      score: prob,
      kind: 'face',
    })
  }

  return rects
}

/**
 * Detect người (mọi góc) + mặt bổ sung.
 * COCO-SSD bắt full-body kể cả quay lưng; BlazeFace bổ sung khi mặt lộ mà chưa có person box.
 */
export async function detectPeopleInVideo(
  video: HTMLVideoElement,
  feedKey: CameraFeedKey,
): Promise<AiOverlayBox[]> {
  const sampleCanvas = drawVideoFrame(video)
  if (!sampleCanvas) return []

  const fit = getOverlayFitForFeed(feedKey)
  const sw = sampleCanvas.width
  const sh = sampleCanvas.height
  const pixelRects: PixelRect[] = []

  const [coco, blaze] = await Promise.all([loadCocoSsd(), loadBlazeFace()])

  if (coco) {
    try {
      pixelRects.push(...await detectPersons(coco, sampleCanvas))
    } catch {
      /* fallback blaze */
    }
  }

  if (blaze) {
    try {
      const faces = await detectFaces(blaze, sampleCanvas)
      for (const face of faces) {
        const c = rectCenter(face)
        const covered = pixelRects.some(p => p.kind === 'person' && containsPoint(p, c.x, c.y))
        if (!covered) pixelRects.push(face)
      }
    } catch {
      /* ignore */
    }
  }

  const merged = dedupeRects(pixelRects)

  return merged
    .map(r => canvasToVideoRect(r, video, sw, sh, fit))
    .filter((b): b is AiOverlayBox => b !== null)
}

/** @deprecated alias */
export const detectFacesInVideo = detectPeopleInVideo

export function preloadFaceDetection(): void {
  void loadCocoSsd()
  void loadBlazeFace()
}
