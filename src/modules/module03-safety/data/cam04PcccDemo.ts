/** Demo PCCC Cam A-04 — toạ độ chuẩn hoá trên khung 1024×972 (scene hút thuốc + lửa). */

/** Người ngồi hút thuốc (foreground phải) — bbox người, không chỉ điếu. */
export const CAM04_PCCC_DEMO_SMOKING = {
  x1: 770 / 1024,
  y1: 560 / 972,
  x2: 1000 / 1024,
  y2: 900 / 972,
} as const

export const CAM04_PCCC_DEMO_FIRE = {
  x1: 730 / 1024,
  y1: 738 / 972,
  x2: 795 / 1024,
  y2: 812 / 972,
} as const

export const CAM04_PCCC_VIDEO_SEGMENT = { startSec: 14.95, endSec: 19.95 } as const

export function isInCam04PcccDemoSegment(currentTimeSec: number): boolean {
  return currentTimeSec >= CAM04_PCCC_VIDEO_SEGMENT.startSec
    && currentTimeSec < CAM04_PCCC_VIDEO_SEGMENT.endSec
}

export type PcccDemoBehavior = 'smoking' | 'fire'

export function cam04PcccDemoDetections(
  frameWidth: number,
  frameHeight: number,
): Array<{
  behavior: PcccDemoBehavior
  label: string
  confidence: number
  bbox: [number, number, number, number]
}> {
  const smokingBbox: [number, number, number, number] = [
    CAM04_PCCC_DEMO_SMOKING.x1 * frameWidth,
    CAM04_PCCC_DEMO_SMOKING.y1 * frameHeight,
    CAM04_PCCC_DEMO_SMOKING.x2 * frameWidth,
    CAM04_PCCC_DEMO_SMOKING.y2 * frameHeight,
  ]
  const fireBbox: [number, number, number, number] = [
    CAM04_PCCC_DEMO_FIRE.x1 * frameWidth,
    CAM04_PCCC_DEMO_FIRE.y1 * frameHeight,
    CAM04_PCCC_DEMO_FIRE.x2 * frameWidth,
    CAM04_PCCC_DEMO_FIRE.y2 * frameHeight,
  ]

  return [
    {
      behavior: 'smoking',
      label: 'Hút thuốc',
      confidence: 0.91,
      bbox: smokingBbox,
    },
    {
      behavior: 'fire',
      label: 'Cháy nổ',
      confidence: 0.88,
      bbox: fireBbox,
    },
  ]
}
