/** Logic dây an toàn WAH — không log / không vẽ vi phạm khi đã detect harness. */

export type WahBboxDetection = {
  behavior: string
  bbox: [number, number, number, number]
  confidence?: number
}

function bboxCenter(bbox: [number, number, number, number]): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
}

function centerInside(
  inner: [number, number, number, number],
  outer: [number, number, number, number],
): boolean {
  const [cx, cy] = bboxCenter(inner)
  return cx >= outer[0] && cx <= outer[2] && cy >= outer[1] && cy <= outer[3]
}

export function wahPersonHasHarness(
  personBbox: [number, number, number, number],
  detections: WahBboxDetection[],
): boolean {
  return detections.some(
    d => d.behavior === 'safety_harness' && centerInside(d.bbox, personBbox),
  )
}

/** Bỏ no_harness nếu cùng người đã có safety_harness (tránh false positive dây chữ X). */
export function filterWahHarnessFalsePositives<T extends WahBboxDetection>(
  detections: T[],
): T[] {
  const persons = detections.filter(d => d.behavior === 'person')
  return detections.filter(d => {
    if (d.behavior !== 'no_harness') return true
    const person = persons.find(p => centerInside(d.bbox, p.bbox) || centerInside(p.bbox, d.bbox))
    if (!person) return true
    return !wahPersonHasHarness(person.bbox, detections)
  })
}

export function hasWahHarnessViolation(
  detections: WahBboxDetection[],
  minConf = 0.5,
): boolean {
  return filterWahHarnessFalsePositives(detections).some(
    d => d.behavior === 'no_harness' && (d.confidence ?? 1) >= minConf,
  )
}
