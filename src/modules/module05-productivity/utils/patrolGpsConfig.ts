/**
 * Chế độ GPS tương đối — mặc định bật cho mọi camera tuần tra (HC-*, DR-*).
 *
 * Vị trí hiển thị = tâm Cầu Sông Hốt + (GPS hiện tại − GPS lần fix đầu).
 * Không có GPS → neo tại PATROL_SITE_CENTER.
 *
 * Tắt bằng VITE_PATROL_GPS_RELATIVE=0 khi chạy thật tại hiện trường (toạ độ thật).
 */
import { isPatrolMetricsCameraId } from '../data/patrolHelmetScope'

export const PATROL_RELATIVE_GPS_ENABLED =
  import.meta.env.VITE_PATROL_GPS_RELATIVE !== '0'

/** Áp relative mapping cho helmet + flycam tuần tra. */
export function isPatrolRelativeGpsCamera(cameraId: string): boolean {
  return PATROL_RELATIVE_GPS_ENABLED && isPatrolMetricsCameraId(cameraId)
}
