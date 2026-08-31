/** Đồng bộ backend `worker_identity.gallery` — 3 góc bắt buộc, slot 4 tuỳ chọn. */
export const FACE_SCAN_POSE_COUNT = 4
export const FACE_SCAN_POSE_REQUIRED = 3

export const FACE_SCAN_POSE_LABELS = [
  'Chính diện',
  'Quay trái',
  'Quay phải',
  'Cúi xuống',
] as const

export type ScanPoseSlot = 1 | 2 | 3 | 4

/** Nhãn la bàn theo ringIdx 0→3: trên · phải · dưới · trái. */
export const FACE_SCAN_RING_QUADRANT_LABELS = ['TRÊN', 'PHẢI', 'DƯỚI', 'TRÁI'] as const

export const FACE_SCAN_RING_INDEX_BY_SLOT: Record<ScanPoseSlot, number> = {
  1: 0,
  2: 3,
  3: 1,
  4: 2,
}

export const FACE_SCAN_RING_ROTATION_BY_INDEX = [-90, 0, 90, 180] as const

export function faceScanPoseLabel(slot: ScanPoseSlot): string {
  return FACE_SCAN_POSE_LABELS[slot - 1]
}

export function defaultFaceScanPoses(): Array<{
  slot: number
  label: string
  captured: boolean
  optional?: boolean
}> {
  return FACE_SCAN_POSE_LABELS.map((label, i) => ({
    slot: i + 1,
    label,
    captured: false,
    optional: i + 1 > FACE_SCAN_POSE_REQUIRED,
  }))
}

export function guidanceForSlot(slot: ScanPoseSlot): string {
  switch (slot) {
    case 1:
      return 'Nhìn thẳng vào camera'
    case 2:
      return 'Quay đầu chậm sang trái'
    case 3:
      return 'Quay đầu chậm sang phải'
    case 4:
      return 'Cúi cằm nhẹ xuống (tuỳ chọn)'
    default:
      return 'Quay đầu chậm để hoàn thành vòng tròn'
  }
}

export function faceScanMainInstruction(
  slot: ScanPoseSlot,
  complete: boolean,
  mode: 'auto' | 'manual',
): string {
  if (complete) return 'Hoàn tất quét khuôn mặt'
  if (mode === 'auto') return 'Quay đầu chậm — đủ 3 góc bắt buộc'
  return guidanceForSlot(slot)
}
