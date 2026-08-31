/** Đồng bộ với backend `worker_identity.gallery.POSE_LABELS`. */
export const FACE_SCAN_POSE_COUNT = 5

export const FACE_SCAN_POSE_LABELS = [
  'Chính diện',
  'Quay trái',
  'Quay phải',
  'Cúi xuống',
  'Ngửa lên',
] as const

export type ScanPoseSlot = 1 | 2 | 3 | 4 | 5

/** Nhãn la bàn theo ringIdx 0→3: trên · phải · dưới · trái (khớp screenshot eKYC). */
export const FACE_SCAN_RING_QUADRANT_LABELS = ['TRÊN', 'PHẢI', 'DƯỚI', 'TRÁI'] as const

/** Vị trí cung trên vòng: 0=trên, 1=phải, 2=dưới, 3=trái — khớp gallery slot 1–5. */
export const FACE_SCAN_RING_INDEX_BY_SLOT: Record<ScanPoseSlot, number> = {
  1: 0,
  2: 3,
  3: 1,
  4: 2,
  5: 0,
}

export const FACE_SCAN_RING_ROTATION_BY_INDEX = [-90, 0, 90, 180] as const

export function faceScanPoseLabel(slot: ScanPoseSlot): string {
  return FACE_SCAN_POSE_LABELS[slot - 1]
}

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
      return 'Nhìn thẳng vào camera'
    case 2:
      return 'Quay đầu chậm sang trái'
    case 3:
      return 'Quay đầu chậm sang phải'
    case 4:
      return 'Cúi cằm nhẹ xuống'
    case 5:
      return 'Ngửa cằm nhẹ lên'
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
  if (mode === 'auto') return 'Quay đầu chậm để hoàn thành vòng tròn'
  return guidanceForSlot(slot)
}
