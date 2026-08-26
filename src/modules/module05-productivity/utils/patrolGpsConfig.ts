/**
 * Chế độ GPS tương đối — chỉ dùng để trình diễn khi đứng xa công trường.
 *
 * Vị trí hiển thị = tâm công trường + (GPS hiện tại − GPS lần fix đầu). Đi bộ
 * ở Hà Nội vẫn thấy chấm di chuyển trong ranh giới Cầu Sông Hốt.
 *
 * Mặc định **tắt**: ngoài hiện trường thật nó cho toạ độ sai, và tệ hơn là mọi
 * mũ đều bị neo về đúng một điểm ở lần fix đầu — hai mũ chồng lên nhau trên
 * bản đồ cho tới khi ai đó bước đi. Bật lại bằng VITE_PATROL_GPS_RELATIVE=1
 * khi cần demo xa công trường.
 */
export const PATROL_RELATIVE_GPS_ENABLED =
  import.meta.env.VITE_PATROL_GPS_RELATIVE === '1'

/** Chỉ áp relative mapping cho helmet bodycam. */
export function isPatrolRelativeGpsCamera(cameraId: string): boolean {
  return PATROL_RELATIVE_GPS_ENABLED && cameraId.startsWith('HC-')
}
