/**
 * Local MP4 feeds — construction-site training footage (Mixkit, free license).
 * Copied from public/ at build time — works on GitHub Pages.
 */
export type CameraFeedKey =
  | 'toolbox-blueprint'   // Công nhân xem bản vẽ / toolbox talk
  | 'training-plans'      // Học viên + giám sát xem plan tại công trường
  | 'safety-briefing'     // Briefing an toàn, silhouette kế hoạch
  | 'safety-helmets'      // Đoàn công nhân mũ bảo hộ, áo phản quang
  | 'yard-builders'       // Thi công tại sân tập
  | 'workshop-weld'       // Hàn / khu máy móc
  | 'site-gate'           // Mặt bằng công trường / cổng vào
  | 'site-cranes'         // Toàn cảnh công trình (cần cẩu)

const FEED_FILES: Record<CameraFeedKey, string> = {
  'toolbox-blueprint': 'toolbox-blueprint.mp4',
  'training-plans': 'training-plans.mp4',
  'safety-briefing': 'safety-briefing.mp4',
  'safety-helmets': 'safety-helmets.mp4',
  'yard-builders': 'yard-builders.mp4',
  'workshop-weld': 'workshop-weld.mp4',
  'site-gate': 'site-gate.mp4',
  'site-cranes': 'site-cranes.mp4',
}

export function getCameraFeedUrl(key: CameraFeedKey): string {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/')
  return `${base}camera-feeds/${FEED_FILES[key]}`
}

/** Camera id → feed clip (khớp vị trí lắp đặt trên công trường). */
export const CAMERA_FEED_BY_ID: Record<string, CameraFeedKey> = {
  'A-01': 'site-gate',
  'A-02': 'toolbox-blueprint',
  'A-03': 'training-plans',
  'A-04': 'yard-builders',
  'A-05': 'safety-helmets',
  'A-06': 'workshop-weld',
  'A-07': 'site-cranes',
  'A-08': 'safety-briefing',
  'B-01': 'site-gate',
  'B-02': 'safety-briefing',
  'B-03': 'toolbox-blueprint',
  'B-04': 'training-plans',
  'B-05': 'safety-helmets',
  'B-06': 'workshop-weld',
  'B-07': 'yard-builders',
  'B-08': 'safety-helmets',
}

export function getStreamUrlForCamera(cameraId: string): string | undefined {
  const key = CAMERA_FEED_BY_ID[cameraId]
  return key ? getCameraFeedUrl(key) : undefined
}
