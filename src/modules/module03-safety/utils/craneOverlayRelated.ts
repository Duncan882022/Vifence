import type { CraneProximityDetection } from '../services/craneProximityBackend.service'
import { machineKindLabel } from './roiOverlayCode'

type Bbox = [number, number, number, number]

function bboxCenter(bbox: Bbox): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
}

function bboxDistance(a: Bbox, b: Bbox): number {
  const [ax, ay] = bboxCenter(a)
  const [bx, by] = bboxCenter(b)
  return ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5
}

const MACHINE_BEHAVIORS = new Set([
  'crane',
  'crane_green',
  'sany_drill',
  'excavator_orange',
  'tower_crane',
  'road_roller',
  'dump_truck',
  'forklift',
  'machinery',
])

function isMachineDetection(d: CraneProximityDetection): boolean {
  if (d.behavior === 'crane' && d.machine_kind) return true
  return MACHINE_BEHAVIORS.has(d.behavior)
}

export { isMachineDetection }

function machineFromViolation(violation: CraneProximityDetection): CraneProximityDetection | null {
  if (violation.behavior !== 'crane_proximity') return null
  const bbox = violation.machine_bbox
  if (!bbox || bbox.length < 4) return null
  return {
    behavior: 'crane',
    label: machineKindLabel(violation.machine_kind),
    scenario_id: violation.scenario_id,
    confidence: Math.max(violation.confidence, 0.85),
    bbox: [bbox[0], bbox[1], bbox[2], bbox[3]],
    machine_kind: violation.machine_kind,
  }
}

/** Máy/cẩu gần nhất với vi phạm crane_proximity — hiển thị dashed trên cam. */
export function findCraneMachineForViolation(
  violation: CraneProximityDetection,
  all: CraneProximityDetection[],
): CraneProximityDetection | undefined {
  const machines = all.filter(isMachineDetection)
  if (machines.length === 0) return undefined

  let best: CraneProximityDetection | undefined
  let bestDist = Number.POSITIVE_INFINITY
  for (const machine of machines) {
    const dist = bboxDistance(violation.bbox, machine.bbox)
    if (dist < bestDist) {
      bestDist = dist
      best = machine
    }
  }
  return best
}

export function appendCraneProximityRelated(
  visibleViolations: CraneProximityDetection[],
  all: CraneProximityDetection[],
): CraneProximityDetection[] {
  const extras: CraneProximityDetection[] = []
  const seen = new Set<string>()

  for (const violation of visibleViolations) {
    if (violation.behavior !== 'crane_proximity') continue
    const machine = findCraneMachineForViolation(violation, all)
      ?? machineFromViolation(violation)
    if (!machine) continue
    const key = `${machine.behavior}-${machine.machine_kind ?? 'x'}-${machine.bbox.map(v => Math.round(v)).join(',')}`
    if (seen.has(key)) continue
    seen.add(key)
    extras.push(machine)
  }

  return [...visibleViolations, ...extras]
}
