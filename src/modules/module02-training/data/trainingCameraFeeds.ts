/**
 * Local MP4 feeds — cắt từ YouTube Unicons Safety Supervisors (Js-1FbF-7yU).
 * OCP1-A/B: CCTV 16:9 · Body cam: 9:16 · Flycam: 16:9 toàn cảnh.
 *
 * Mốc cắt (giây): OCP1-A 170,188,205,212,218,238,248,252 ·
 * Body 163,209,169 · Fly 174,177
 */
export type CameraFeedKey =
  | 'ocp1-a-01'
  | 'ocp1-a-02'
  | 'ocp1-a-03'
  | 'ocp1-a-04'
  | 'ocp1-a-05'
  | 'ocp1-a-06'
  | 'ocp1-a-07'
  | 'ocp1-a-08'
  | 'ocp1-b-01'
  | 'ocp1-b-02'
  | 'ocp1-b-03'
  | 'ocp1-b-04'
  | 'ocp1-b-05'
  | 'ocp1-b-06'
  | 'ocp1-b-07'
  | 'ocp1-b-08'
  | 'bodycam-01'
  | 'bodycam-02'
  | 'bodycam-03'
  | 'flycam-01'
  | 'flycam-02'
  | 'toolbox-blueprint'
  | 'training-plans'
  | 'safety-briefing'
  | 'safety-helmets'
  | 'yard-builders'
  | 'workshop-weld'
  | 'site-gate'
  | 'site-cranes'

const FEED_FILES: Record<CameraFeedKey, string> = {
  'ocp1-a-01': 'ocp1-a-01.mp4',
  'ocp1-a-02': 'ocp1-a-02.mp4',
  'ocp1-a-03': 'ocp1-a-03.mp4',
  'ocp1-a-04': 'ocp1-a-04.mp4',
  'ocp1-a-05': 'ocp1-a-05.mp4',
  'ocp1-a-06': 'ocp1-a-06.mp4',
  'ocp1-a-07': 'ocp1-a-07.mp4',
  'ocp1-a-08': 'ocp1-a-08.mp4',
  'ocp1-b-01': 'ocp1-b-01.mp4',
  'ocp1-b-02': 'ocp1-b-02.mp4',
  'ocp1-b-03': 'ocp1-b-03.mp4',
  'ocp1-b-04': 'ocp1-b-04.mp4',
  'ocp1-b-05': 'ocp1-b-05.mp4',
  'ocp1-b-06': 'ocp1-b-06.mp4',
  'ocp1-b-07': 'ocp1-b-07.mp4',
  'ocp1-b-08': 'ocp1-b-08.mp4',
  'bodycam-01': 'bodycam-01.mp4',
  'bodycam-02': 'bodycam-02.mp4',
  'bodycam-03': 'bodycam-03.mp4',
  'flycam-01': 'flycam-01.mp4',
  'flycam-02': 'flycam-02.mp4',
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
  'A-01': 'ocp1-a-01',
  'A-02': 'ocp1-a-02',
  'A-03': 'ocp1-a-03',
  'A-04': 'ocp1-a-04',
  'A-05': 'ocp1-a-05',
  'A-06': 'ocp1-a-06',
  'A-07': 'ocp1-a-07',
  'A-08': 'ocp1-a-08',
  'B-01': 'ocp1-b-01',
  'B-02': 'ocp1-b-02',
  'B-03': 'ocp1-b-03',
  'B-04': 'ocp1-b-04',
  'B-05': 'ocp1-b-05',
  'B-06': 'ocp1-b-06',
  'B-07': 'ocp1-b-07',
  'B-08': 'ocp1-b-08',
  'BC-01': 'bodycam-01',
  'BC-02': 'bodycam-02',
  'BC-03': 'bodycam-03',
  'FC-01': 'flycam-01',
  'FC-02': 'flycam-02',
}

export function getOverlayFitForFeed(feedKey: CameraFeedKey): 'cover' | 'contain' {
  return feedKey.startsWith('bodycam-') ? 'contain' : 'cover'
}

export function getFeedKeyForCamera(cameraId: string): CameraFeedKey | undefined {
  return CAMERA_FEED_BY_ID[cameraId]
}

export function getStreamUrlForCamera(cameraId: string): string | undefined {
  const key = getFeedKeyForCamera(cameraId)
  return key ? getCameraFeedUrl(key) : undefined
}
