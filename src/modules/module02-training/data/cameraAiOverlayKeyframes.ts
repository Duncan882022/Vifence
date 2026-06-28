import type { CameraFeedKey } from './trainingCameraFeeds'

export interface AiOverlayBox {
  x: number
  y: number
  w: number
  h: number
  label: string
}

export interface OverlayKeyframe {
  /** Giây trong clip (loop 10s) */
  t: number
  boxes: AiOverlayBox[]
}

/** Chuyển box full-body sang vùng mặt (đỉnh box). */
export function bodyBoxToFace(box: AiOverlayBox): AiOverlayBox {
  return {
    x: box.x + box.w * 0.2,
    y: box.y,
    w: box.w * 0.6,
    h: Math.max(8, box.h * 0.32),
    label: box.label,
  }
}

/**
 * Keyframe theo thời gian — căn vùng mặt/đầu trên clip OCP1-A (object-cover).
 * Toạ độ % so với khung hiển thị.
 */
export const OVERLAY_KEYFRAMES: Partial<Record<CameraFeedKey, OverlayKeyframe[]>> = {
  'ocp1-a-01': [
    {
      t: 0,
      boxes: [
        { x: 28, y: 14, w: 9, h: 11, label: 'CN' },
        { x: 42, y: 12, w: 9, h: 11, label: 'CN' },
        { x: 56, y: 15, w: 8, h: 10, label: 'CN' },
        { x: 68, y: 13, w: 9, h: 11, label: 'CN' },
      ],
    },
    {
      t: 5,
      boxes: [
        { x: 22, y: 16, w: 10, h: 12, label: 'CN' },
        { x: 38, y: 14, w: 9, h: 11, label: 'CN' },
        { x: 52, y: 15, w: 9, h: 11, label: 'GSAT' },
        { x: 65, y: 14, w: 8, h: 10, label: 'CN' },
        { x: 76, y: 16, w: 8, h: 10, label: 'CN' },
      ],
    },
  ],
  'ocp1-a-02': [
    {
      t: 0,
      boxes: [
        { x: 18, y: 18, w: 10, h: 12, label: 'GSAT' },
        { x: 44, y: 20, w: 9, h: 11, label: 'CN' },
        { x: 62, y: 21, w: 9, h: 11, label: 'CN' },
      ],
    },
    {
      t: 6,
      boxes: [
        { x: 20, y: 17, w: 10, h: 12, label: 'GSAT' },
        { x: 46, y: 19, w: 9, h: 11, label: 'CN' },
        { x: 64, y: 20, w: 9, h: 11, label: 'CN' },
      ],
    },
  ],
  'ocp1-a-03': [
    {
      t: 0,
      boxes: [
        { x: 10, y: 20, w: 8, h: 10, label: 'CN' },
        { x: 24, y: 18, w: 9, h: 11, label: 'CN' },
        { x: 38, y: 17, w: 9, h: 11, label: 'CN' },
        { x: 52, y: 19, w: 8, h: 10, label: 'CN' },
        { x: 66, y: 18, w: 8, h: 10, label: 'CN' },
        { x: 78, y: 20, w: 7, h: 9, label: 'CN' },
      ],
    },
  ],
  'ocp1-a-04': [
    {
      t: 0,
      boxes: [
        { x: 34, y: 12, w: 10, h: 12, label: 'CN' },
        { x: 52, y: 16, w: 9, h: 11, label: 'GSAT' },
        { x: 14, y: 22, w: 8, h: 10, label: 'CN' },
        { x: 72, y: 24, w: 8, h: 10, label: 'CN' },
      ],
    },
    {
      t: 5,
      boxes: [
        { x: 36, y: 11, w: 10, h: 12, label: 'CN' },
        { x: 54, y: 15, w: 9, h: 11, label: 'GSAT' },
        { x: 16, y: 21, w: 8, h: 10, label: 'CN' },
      ],
    },
  ],
  'ocp1-a-05': [
    {
      t: 0,
      boxes: [
        { x: 38, y: 16, w: 9, h: 11, label: 'CN' },
        { x: 22, y: 28, w: 8, h: 10, label: 'CN' },
        { x: 58, y: 30, w: 8, h: 10, label: 'CN' },
      ],
    },
    {
      t: 5,
      boxes: [
        { x: 42, y: 15, w: 9, h: 11, label: 'CN' },
        { x: 26, y: 26, w: 8, h: 10, label: 'CN' },
      ],
    },
  ],
  'ocp1-a-06': [
    {
      t: 0,
      boxes: [
        { x: 16, y: 18, w: 9, h: 11, label: 'CN' },
        { x: 38, y: 17, w: 9, h: 11, label: 'CN' },
        { x: 58, y: 19, w: 9, h: 11, label: 'CN' },
      ],
    },
  ],
  'ocp1-a-07': [
    {
      t: 0,
      boxes: [
        { x: 14, y: 16, w: 10, h: 12, label: 'CN' },
        { x: 36, y: 17, w: 9, h: 11, label: 'CN' },
        { x: 58, y: 18, w: 9, h: 11, label: 'CN' },
      ],
    },
  ],
  'ocp1-a-08': [
    {
      t: 0,
      boxes: [
        { x: 20, y: 14, w: 10, h: 12, label: 'CN' },
        { x: 48, y: 16, w: 9, h: 11, label: 'GSAT' },
      ],
    },
    {
      t: 5,
      boxes: [
        { x: 22, y: 13, w: 10, h: 12, label: 'CN' },
        { x: 50, y: 15, w: 9, h: 11, label: 'GSAT' },
      ],
    },
  ],
}

/** Mixkit / legacy — fallback 1 keyframe (mặt ước lượng từ box thân). */
const LEGACY_BODY: Partial<Record<CameraFeedKey, AiOverlayBox[]>> = {
  'toolbox-blueprint': [
    { x: 24, y: 28, w: 14, h: 40, label: 'HV' },
    { x: 50, y: 24, w: 16, h: 42, label: 'GV' },
  ],
  'training-plans': [
    { x: 20, y: 30, w: 12, h: 36, label: 'HV' },
    { x: 44, y: 26, w: 14, h: 40, label: 'GS' },
    { x: 70, y: 32, w: 12, h: 34, label: 'HV' },
  ],
  'safety-briefing': [
    { x: 27, y: 32, w: 12, h: 38, label: 'HV' },
    { x: 54, y: 28, w: 13, h: 40, label: 'HV' },
  ],
  'safety-helmets': [
    { x: 22, y: 30, w: 11, h: 36, label: 'NV' },
    { x: 40, y: 28, w: 12, h: 38, label: 'NV' },
    { x: 60, y: 32, w: 11, h: 34, label: 'NV' },
  ],
  'yard-builders': [
    { x: 30, y: 34, w: 13, h: 34, label: 'Thợ' },
    { x: 57, y: 30, w: 14, h: 38, label: 'GS' },
  ],
  'workshop-weld': [
    { x: 34, y: 26, w: 16, h: 44, label: 'KT' },
    { x: 64, y: 34, w: 12, h: 32, label: 'HV' },
  ],
  'site-gate': [
    { x: 37, y: 38, w: 9, h: 26, label: 'NV' },
    { x: 60, y: 36, w: 9, h: 28, label: 'NV' },
  ],
  'site-cranes': [
    { x: 42, y: 42, w: 10, h: 24, label: 'NV' },
  ],
}

export function getLegacyFaceKeyframes(feedKey: CameraFeedKey): OverlayKeyframe[] {
  const bodies = LEGACY_BODY[feedKey]
  if (!bodies) return []
  return [{ t: 0, boxes: bodies.map(bodyBoxToFace) }]
}

export function feedUsesKeyframeFallback(feedKey: CameraFeedKey): boolean {
  return (
    !feedKey.startsWith('ocp1-a-')
    && !feedKey.startsWith('ocp1-b-')
    && !feedKey.startsWith('bodycam-')
    && !feedKey.startsWith('flycam-')
  )
}

export function getKeyframesForFeed(feedKey: CameraFeedKey): OverlayKeyframe[] {
  return OVERLAY_KEYFRAMES[feedKey] ?? getLegacyFaceKeyframes(feedKey)
}

/** Nội suy box giữa 2 keyframe theo thời gian clip (giây). */
export function interpolateBoxes(keyframes: OverlayKeyframe[], timeSec: number): AiOverlayBox[] {
  if (keyframes.length === 0) return []
  if (keyframes.length === 1) return keyframes[0].boxes

  const sorted = [...keyframes].sort((a, b) => a.t - b.t)
  const loopT = timeSec % 10

  let nextIdx = sorted.findIndex(k => k.t > loopT)
  if (nextIdx === -1) nextIdx = 0
  const prevIdx = nextIdx === 0 ? sorted.length - 1 : nextIdx - 1

  const prev = sorted[prevIdx]
  const next = sorted[nextIdx]

  let span = next.t - prev.t
  if (span <= 0) span += 10
  let elapsed = loopT - prev.t
  if (elapsed < 0) elapsed += 10

  const ratio = Math.min(1, Math.max(0, elapsed / span))
  const maxLen = Math.max(prev.boxes.length, next.boxes.length)
  const boxes: AiOverlayBox[] = []

  for (let i = 0; i < maxLen; i++) {
    const a = prev.boxes[i] ?? prev.boxes[prev.boxes.length - 1]
    const b = next.boxes[i] ?? next.boxes[next.boxes.length - 1]
    boxes.push({
      label: ratio < 0.5 ? a.label : b.label,
      x: a.x + (b.x - a.x) * ratio,
      y: a.y + (b.y - a.y) * ratio,
      w: a.w + (b.w - a.w) * ratio,
      h: a.h + (b.h - a.h) * ratio,
    })
  }

  return boxes
}
