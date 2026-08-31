/** Đồng bộ với backend `worker_identity.gallery.POSE_LABELS`. */
export const FACE_SCAN_POSE_COUNT = 4

export const FACE_SCAN_POSE_LABELS = [
  'Chính diện',
  'Quay trái',
  'Quay phải',
  'Cúi xuống',
] as const

export const FACE_SCAN_RING_QUADRANTS = ['TRÊN', 'TRÁI', 'PHẢI', 'DƯỚI'] as const

export type ScanPoseSlot = 1 | 2 | 3 | 4

export function defaultFaceScanPoses(): Array<{ slot: number; label: string; captured: boolean }> {
  return FACE_SCAN_POSE_LABELS.map((label, i) => ({
    slot: i + 1,
    label,
    captured: false,
  }))
}

export function guidanceForSlot(slot: ScanPoseSlot): string {
  switch (slot) {
    case 1:
      return 'Bước 1 — Chính diện: nhìn thẳng vào camera (TRÊN)'
    case 2:
      return 'Bước 2 — Quay chậm sang TRÁI'
    case 3:
      return 'Bước 3 — Quay chậm sang PHẢI'
    case 4:
      return 'Bước 4 — Cúi đầu xuống (DƯỚI)'
    default:
      return 'Đưa mặt vào khung tròn'
  }
}
