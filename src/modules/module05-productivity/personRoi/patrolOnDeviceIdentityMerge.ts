import { patrolPersonMeetsDisplayGate } from '../utils/patrolPersonVisibility'
import type { Bbox, PersonRoiDetection, PersonRoiTier } from './types'

export interface PatrolServerIdentityHint {
  behavior: string
  label?: string
  confidence: number
  bbox: Bbox
  subject_bbox?: Bbox
  worker_id?: string
  worker_name?: string
  track_id?: string
  tier?: PersonRoiTier
  face_eligible?: boolean
}

export interface OnDevicePersonBox {
  bbox: Bbox
  score: number
}

const MATCH_IOU_MIN = 0.12

function scaleBbox(bbox: Bbox, fromW: number, fromH: number, toW: number, toH: number): Bbox {
  if (fromW <= 0 || fromH <= 0 || toW <= 0 || toH <= 0) return bbox
  const sx = toW / fromW
  const sy = toH / fromH
  return [bbox[0] * sx, bbox[1] * sy, bbox[2] * sx, bbox[3] * sy]
}

function bboxIou(a: Bbox, b: Bbox): number {
  const ix1 = Math.max(a[0], b[0])
  const iy1 = Math.max(a[1], b[1])
  const ix2 = Math.min(a[2], b[2])
  const iy2 = Math.min(a[3], b[3])
  if (ix2 <= ix1 || iy2 <= iy1) return 0
  const inter = (ix2 - ix1) * (iy2 - iy1)
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1])
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1])
  const union = areaA + areaB - inter
  return union > 0 ? inter / union : 0
}

function pickServerBox(hint: PatrolServerIdentityHint): Bbox {
  if (hint.subject_bbox?.length === 4) return hint.subject_bbox
  return hint.bbox
}

function tierFromHint(hint: PatrolServerIdentityHint | undefined): PersonRoiTier {
  if (hint?.tier) return hint.tier
  if (hint?.worker_id && hint.worker_id !== 'unknown') return 'person'
  return 'object'
}

/**
 * Ghép bbox on-device (mượt, khớp video) với metadata server (sgc-*, tier, track).
 * Pattern Hikvision: edge detect vị trí · cloud chỉ gán danh tính.
 */
export function mergePatrolOnDeviceWithServerIdentity(
  localBoxes: OnDevicePersonBox[],
  serverHints: PatrolServerIdentityHint[],
  frameW: number,
  frameH: number,
  serverFrameW: number,
  serverFrameH: number,
): PersonRoiDetection[] {
  if (frameW <= 0 || frameH <= 0) return []

  const locals = localBoxes.filter(box =>
    patrolPersonMeetsDisplayGate({
      bbox: box.bbox,
      frameW,
      frameH,
    }),
  )

  const scaledServer = serverHints
    .filter(h => h.behavior === 'person')
    .map(h => ({
      hint: h,
      bbox: scaleBbox(pickServerBox(h), serverFrameW, serverFrameH, frameW, frameH),
    }))

  const usedServer = new Set<number>()

  return locals.map((local, index) => {
    let bestIdx = -1
    let bestIou = 0
    for (let i = 0; i < scaledServer.length; i += 1) {
      if (usedServer.has(i)) continue
      const iou = bboxIou(local.bbox, scaledServer[i].bbox)
      if (iou > bestIou && iou >= MATCH_IOU_MIN) {
        bestIou = iou
        bestIdx = i
      }
    }

    const server = bestIdx >= 0 ? scaledServer[bestIdx].hint : undefined
    if (bestIdx >= 0) usedServer.add(bestIdx)

    return {
      behavior: 'person',
      label: server?.label ?? 'CN',
      confidence: Math.max(local.score, server?.confidence ?? 0),
      bbox: local.bbox,
      subject_bbox: local.bbox,
      worker_id: server?.worker_id,
      worker_name: server?.worker_name,
      track_id: server?.track_id ?? `dev:${index + 1}`,
      tier: tierFromHint(server),
      face_eligible: server?.face_eligible,
    }
  })
}
