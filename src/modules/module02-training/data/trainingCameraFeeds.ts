/**
 * Local MP4 feeds — cắt từ YouTube Unicons Safety Supervisors (Js-1FbF-7yU).
 * OCP1-A/B: CCTV 16:9 · Body cam: 9:16 · Flycam: 16:9 toàn cảnh.
 * A-03 (TTDV-A · Cam 03): mock từ public/camera-feeds/ttdv-a-cam03-test.mp4
 * A-04 (TTDV-A · Cam 04): mock từ public/camera-feeds/ttdv-a-cam04-test.mp4
 *   (10s hiện trường cẩu + 5s PPE workers + 5s PCCC hút thuốc/lửa)
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
  'ocp1-a-03': 'ttdv-a-cam03-test.mp4',
  'ocp1-a-04': 'ttdv-a-cam04-test.mp4',
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

const POSTER_FILES: Partial<Record<CameraFeedKey, string>> = {
  'ocp1-a-03': 'cam03-atgt-scene.jpg',
  'ocp1-a-04': 'cam04-ppe-workers.jpg',
}

/** Ảnh poster — hiển thị trên mobile khi video đang buffer (iOS Safari). */
export function getCameraFeedPosterUrl(key: CameraFeedKey): string | undefined {
  const file = POSTER_FILES[key]
  if (!file) return undefined
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/')
  return `${base}camera-feeds/${file}`
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
  if (feedKey.startsWith('bodycam-')) return 'contain'
  /** TTDV-A Cam 03/04 — contain: hiển thị full khung gốc, không crop (640² / 1024×976). */
  if (feedKey === 'ocp1-a-03' || feedKey === 'ocp1-a-04') return 'contain'
  return 'cover'
}

/** object-position khi dùng object-cover — Cam 03/04 dùng contain nên luôn center. */
export function getVideoObjectPositionForCamera(
  cameraId: string,
  streamType: 'fixed' | 'bodycam' | 'flycam' | 'mobile' = 'fixed',
): 'center' | 'bottom' {
  if (streamType === 'bodycam' || streamType === 'mobile') return 'center'
  const feedKey = getFeedKeyForCamera(cameraId)
  if (feedKey === 'ocp1-a-03' || feedKey === 'ocp1-a-04') return 'center'
  return 'center'
}

export function getVideoObjectFitForCamera(
  cameraId: string,
  streamType: 'fixed' | 'bodycam' | 'flycam' | 'mobile' = 'fixed',
): 'cover' | 'contain' {
  if (streamType === 'bodycam' || streamType === 'mobile') return 'contain'
  const feedKey = getFeedKeyForCamera(cameraId)
  if (feedKey) return getOverlayFitForFeed(feedKey)
  return 'cover'
}

export function getFeedKeyForCamera(cameraId: string): CameraFeedKey | undefined {
  return CAMERA_FEED_BY_ID[cameraId]
}

export function getStreamUrlForCamera(cameraId: string): string | undefined {
  const key = getFeedKeyForCamera(cameraId)
  return key ? getCameraFeedUrl(key) : undefined
}

/**
 * VMS mode — HLS stream URL từ backend.
 * Khi VMS_MODE_ENABLED=true trên VPS, camera A-03/A-04 stream qua HLS.
 * VITE_VMS_BACKEND_URL phải trỏ tới backend (vd https://217.217.253.247.nip.io).
 */
export function getVmsHlsUrl(cameraId: string): string | undefined {
  const backendUrl = import.meta.env.VITE_VMS_BACKEND_URL as string | undefined
  if (!backendUrl) return undefined
  const base = backendUrl.replace(/\/$/, '')
  return `${base}/stream/${cameraId}/index.m3u8`
}

/** Trả về URL stream tốt nhất: VMS HLS nếu có, fallback MP4 local. */
export function getBestStreamUrl(cameraId: string): string | undefined {
  return getVmsHlsUrl(cameraId) ?? getStreamUrlForCamera(cameraId)
}
