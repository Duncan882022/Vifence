/** Đồng bộ với backend `worker_identity.gallery.POSE_LABELS`. */
export const FACE_SCAN_POSE_COUNT = 4

export const FACE_SCAN_POSE_LABELS = [
  'Chính diện',
  'Quay trái',
  'Quay phải',
  'Cúi xuống',
] as const

export type ScanPoseSlot = 1 | 2 | 3 | 4

/** Vị trí cung trên vòng: 0=trên, 1=phải, 2=dưới, 3=trái — khớp gallery slot 1–4. */
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
      return 'Bước 1 — Chính diện: nhìn thẳng vào camera, mặt giữa khung tròn'
    case 2:
      return 'Bước 2 — Quay trái: quay mặt sang trái khoảng 45°'
    case 3:
      return 'Bước 3 — Quay phải: quay mặt sang phải khoảng 45°'
    case 4:
      return 'Bước 4 — Cúi xuống: cúi cằm nhẹ, mắt vẫn trong khung'
    default:
      return 'Đưa mặt vào khung tròn'
  }
}
