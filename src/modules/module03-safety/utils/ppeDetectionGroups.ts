import type { PpeDetection } from '../services/ppeBackend.service'

export type PpeBodySlot = 'head' | 'torso' | 'feet'

export interface PpePersonGroup {
  id: string
  person: PpeDetection
  slots: {
    head?: PpeDetection
    torso?: PpeDetection
    feet: PpeDetection[]
  }
}

type Bbox = [number, number, number, number]

const HEAD_BEHAVIORS = new Set(['hard_hat', 'no_helmet'])
const TORSO_BEHAVIORS = new Set(['safety_vest', 'no_vest'])
const FEET_BEHAVIORS = new Set(['safety_shoes', 'no_shoes'])

function bboxCenter(bbox: Bbox): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
}

function pointInBbox(x: number, y: number, bbox: Bbox): boolean {
  return x >= bbox[0] && x <= bbox[2] && y >= bbox[1] && y <= bbox[3]
}

function slotForBehavior(behavior: string): PpeBodySlot | null {
  if (HEAD_BEHAVIORS.has(behavior)) return 'head'
  if (TORSO_BEHAVIORS.has(behavior)) return 'torso'
  if (FEET_BEHAVIORS.has(behavior)) return 'feet'
  return null
}

function isViolationBehavior(behavior: string): boolean {
  return behavior.startsWith('no_')
}

/** Vùng con mặc định trong bbox người — khớp backend ppe_analyzer._sub_region. */
export function derivePpeSlotBbox(personBbox: Bbox, slot: PpeBodySlot): Bbox {
  const [x1, y1, x2, y2] = personBbox
  const h = y2 - y1
  switch (slot) {
    case 'head':
      return [x1, y1, x2, y1 + h * 0.30]
    case 'torso':
      return [x1, y1 + h * 0.20, x2, y1 + h * 0.72]
    case 'feet':
      return [x1, y1 + h * 0.78, x2, y2]
  }
}

export function resolvePpeSlotBbox(
  group: PpePersonGroup,
  slot: PpeBodySlot,
  footIndex = 0,
): Bbox {
  if (slot === 'head' && group.slots.head) return group.slots.head.bbox
  if (slot === 'torso' && group.slots.torso) return group.slots.torso.bbox
  if (slot === 'feet') {
    const foot = group.slots.feet[footIndex]
    if (foot) return foot.bbox
  }
  return derivePpeSlotBbox(group.person.bbox, slot)
}

export function groupPpeDetections(
  detections: Array<PpeDetection & { trackId?: string }>,
): PpePersonGroup[] {
  const persons = detections.filter(d => d.behavior === 'person')
  const others = detections.filter(d => d.behavior !== 'person')

  return persons.map((person, index) => {
    const pb = person.bbox
    const group: PpePersonGroup = {
      id: person.trackId ?? `ppe-${index}-${Math.round(pb[0])}-${Math.round(pb[1])}`,
      person,
      slots: { feet: [] },
    }

    for (const det of others) {
      const slot = slotForBehavior(det.behavior)
      if (!slot) continue
      const [cx, cy] = bboxCenter(det.bbox)
      if (!pointInBbox(cx, cy, pb)) continue

      if (slot === 'feet') {
        group.slots.feet.push(det)
        group.slots.feet.sort((a, b) => a.bbox[0] - b.bbox[0])
        continue
      }

      const current = group.slots[slot]
      if (!current) {
        group.slots[slot] = det
        continue
      }
      const preferViolation = isViolationBehavior(det.behavior) && !isViolationBehavior(current.behavior)
      const preferConf = det.confidence > current.confidence
      if (preferViolation || (isViolationBehavior(det.behavior) === isViolationBehavior(current.behavior) && preferConf)) {
        group.slots[slot] = det
      }
    }

    return group
  })
}

/** PPE-003 — chỉ vi phạm giày khi cả 2 chân đều thiếu giày (detect được). */
export function groupHasFeetShoesViolation(group: PpePersonGroup): boolean {
  return group.slots.feet.filter(d => d.behavior === 'no_shoes').length >= 2
}

export function groupHasViolation(group: PpePersonGroup): boolean {
  if (group.slots.head?.behavior.startsWith('no_')) return true
  if (group.slots.torso?.behavior.startsWith('no_')) return true
  return groupHasFeetShoesViolation(group)
}

/** Box overlay tách rời — không gộp bbox người (giày so le khó gộp). */
export function flattenPpeViolationOverlayBoxes(groups: PpePersonGroup[]): PpeDetection[] {
  const out: PpeDetection[] = []
  for (const group of groups) {
    if (group.slots.head?.behavior.startsWith('no_')) out.push(group.slots.head)
    if (group.slots.torso?.behavior.startsWith('no_')) out.push(group.slots.torso)
    if (groupHasFeetShoesViolation(group)) {
      out.push(...group.slots.feet.filter(d => d.behavior === 'no_shoes'))
    }
  }
  return out
}

export function slotDetection(
  group: PpePersonGroup,
  slot: PpeBodySlot,
  footIndex = 0,
): PpeDetection | undefined {
  if (slot === 'head') return group.slots.head
  if (slot === 'torso') return group.slots.torso
  return group.slots.feet[footIndex]
}

export function bboxToRelativeInner(
  inner: Bbox,
  outer: Bbox,
): { x: number; y: number; w: number; h: number } {
  const [ox1, oy1, ox2, oy2] = outer
  const [ix1, iy1, ix2, iy2] = inner
  const ow = Math.max(ox2 - ox1, 1)
  const oh = Math.max(oy2 - oy1, 1)
  return {
    x: ((ix1 - ox1) / ow) * 100,
    y: ((iy1 - oy1) / oh) * 100,
    w: Math.max(((ix2 - ix1) / ow) * 100, 8),
    h: Math.max(((iy2 - iy1) / oh) * 100, 8),
  }
}
