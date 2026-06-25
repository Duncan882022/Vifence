/**
 * Local MP4 feeds — construction-site training footage (Mixkit, free license).
 */
export type CameraFeedKey =
  | 'toolbox-blueprint'
  | 'training-plans'
  | 'safety-briefing'
  | 'safety-helmets'
  | 'yard-builders'
  | 'workshop-weld'
  | 'site-gate'
  | 'site-cranes'

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

/** Camera id → clip (khớp khoá học / vị trí lắp cam). */
export const CAMERA_FEED_BY_ID: Record<string, CameraFeedKey> = {
  'A-01': 'site-gate',
  'A-02': 'toolbox-blueprint',
  'A-03': 'yard-builders',
  'A-04': 'yard-builders',
  'A-05': 'safety-helmets',
  'A-06': 'workshop-weld',
  'A-07': 'site-cranes',
  'A-08': 'safety-briefing',
  'B-01': 'site-gate',
  'B-02': 'safety-briefing',
  'B-03': 'workshop-weld',
  'B-04': 'training-plans',
  'B-05': 'safety-helmets',
  'B-06': 'workshop-weld',
  'B-07': 'yard-builders',
  'B-08': 'safety-helmets',
  /* Body cam */
  'BC-01': 'safety-helmets',
  'BC-02': 'training-plans',
  'BC-03': 'yard-builders',
  /* Flycam */
  'FC-01': 'site-cranes',
  'FC-02': 'site-gate',
}

export function getFeedKeyForCamera(cameraId: string): CameraFeedKey | undefined {
  return CAMERA_FEED_BY_ID[cameraId]
}

export function getStreamUrlForCamera(cameraId: string): string | undefined {
  const key = getFeedKeyForCamera(cameraId)
  return key ? getCameraFeedUrl(key) : undefined
}
