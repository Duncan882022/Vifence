/**
 * HC-02 demo GPS — neo tại PATROL_SITE_CENTER, cộng delta di chuyển thật.
 * Tắt khi test onsite: VITE_PATROL_GPS_RELATIVE=0
 */
export const PATROL_RELATIVE_GPS_ENABLED =
  import.meta.env.VITE_PATROL_GPS_RELATIVE !== '0'

/** Chỉ áp relative mapping cho helmet bodycam. */
export function isPatrolRelativeGpsCamera(cameraId: string): boolean {
  return PATROL_RELATIVE_GPS_ENABLED && cameraId.startsWith('HC-')
}
