/** Person demo WAH Cam A-04 — toạ độ chuẩn hoá 0–1 trên khung 1024×976. */
export const CAM04_WAH_DEMO_PERSONS = [
  { id: 'person-1', x1: 770 / 1024, y1: 94 / 976, x2: 815 / 1024, y2: 188 / 976, hasHarness: true },
  { id: 'person-2', x1: 888 / 1024, y1: 40 / 976, x2: 938 / 1024, y2: 132 / 976, hasHarness: true },
] as const

export const CAM04_WAH_VIDEO_SEGMENT = { startSec: 19.95, endSec: 24.95 } as const

export function isInCam04WahDemoSegment(currentTimeSec: number): boolean {
  return currentTimeSec >= CAM04_WAH_VIDEO_SEGMENT.startSec
    && currentTimeSec < CAM04_WAH_VIDEO_SEGMENT.endSec
}

export type WahDemoBehavior = 'person' | 'no_harness' | 'safety_harness'

export function cam04WahDemoDetections(
  frameWidth: number,
  frameHeight: number,
): Array<{
  behavior: WahDemoBehavior
  label: string
  confidence: number
  bbox: [number, number, number, number]
}> {
  const out: Array<{
    behavior: WahDemoBehavior
    label: string
    confidence: number
    bbox: [number, number, number, number]
  }> = []

  for (const person of CAM04_WAH_DEMO_PERSONS) {
    const bbox: [number, number, number, number] = [
      person.x1 * frameWidth,
      person.y1 * frameHeight,
      person.x2 * frameWidth,
      person.y2 * frameHeight,
    ]
    out.push({
      behavior: 'person',
      label: 'Person',
      confidence: 0.92,
      bbox,
    })
    if (person.hasHarness) {
      out.push({
        behavior: 'safety_harness',
        label: 'Dây an toàn',
        confidence: 0.87,
        bbox,
      })
    } else {
      out.push({
        behavior: 'no_harness',
        label: 'Không dây an toàn',
        confidence: 0.89,
        bbox,
      })
    }
  }

  return out
}
