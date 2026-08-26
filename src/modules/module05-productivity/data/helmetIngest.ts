/**
 * Helmet ingest — nguồn sự thật duy nhất cho mọi mũ (HC-*).
 *
 * Kiến trúc hội tụ: thiết bị đẩy luồng vào MediaMTX (WHIP hoặc RTSP), backend
 * pull RTSP nội bộ để chạy AI, CMS xem qua WHEP (low-latency) hoặc HLS.
 * Từ MediaMTX trở đi HC-01 và HC-02 đi chung một đường — chỉ khác cách publish.
 *
 * `legacy-mobile` giữ luồng cũ (getUserMedia → POST /analyze/frame) làm fallback
 * khi chưa cấu hình MediaMTX, để bản demo hiện tại không gãy.
 */

/** Cách thiết bị đưa luồng vào MediaMTX. */
export type HelmetIngestKind =
  /** Bodycam IP tự publish RTSP — backend/MediaMTX pull. */
  | 'rtsp'
  /** Trình duyệt publish WebRTC (WHIP) — điện thoại hoặc bodycam WebRTC. */
  | 'whip'
  /** Luồng cũ: chụp JPEG gửi POST /analyze/frame. Chỉ dùng khi chưa có MediaMTX. */
  | 'legacy-mobile'

export interface HelmetIngestConfig {
  helmetId: string
  kind: HelmetIngestKind
  /** Path trên MediaMTX — dùng chung cho WHIP publish, WHEP play và HLS. */
  path: string
  /** RTSP gốc (kind = 'rtsp') — tham chiếu cho backend, browser không phát trực tiếp. */
  rtspUrl?: string
}

/**
 * Danh sách mũ của Module 05.
 * Đặt ở đây (module không phụ thuộc gì) để service tầng dưới dùng được mà không
 * kéo theo vòng import qua `patrolCameras.ts`.
 */
export const PATROL_HELMET_IDS = ['HC-01', 'HC-02'] as const

function readEnv(key: string): string | undefined {
  const raw = import.meta.env[key as keyof ImportMetaEnv]
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * Base WebRTC của MediaMTX (WHIP + WHEP cùng cổng, mặc định 8889).
 * Ưu tiên `VITE_MEDIAMTX_WEBRTC_URL`; nếu chỉ có host thì tự dựng từ host + port.
 */
export function getMediaMtxWebrtcBase(): string | undefined {
  const explicit = readEnv('VITE_MEDIAMTX_WEBRTC_URL')
  if (explicit) return stripTrailingSlash(explicit)

  const host = readEnv('VITE_MEDIAMTX_HOST')
  if (!host) return undefined

  const port = readEnv('VITE_MEDIAMTX_WEBRTC_PORT') ?? '8889'
  const scheme = typeof window !== 'undefined' && window.location.protocol === 'https:'
    ? 'https'
    : 'http'
  return `${scheme}://${host}:${port}`
}

/**
 * Base Playback Server của MediaMTX (mặc định cổng 9996) — đọc băng đã ghi.
 *
 * Không cấu hình thì playback tắt hẳn. Cố đoán ra URL rồi trỏ nhầm vào luồng
 * live là kiểu hỏng khó nhận ra nhất: người xem tưởng đang xem lại quá khứ.
 */
export function getMediaMtxPlaybackBase(): string | undefined {
  const explicit = readEnv('VITE_MEDIAMTX_PLAYBACK_URL')
  if (explicit) return stripTrailingSlash(explicit)

  const host = readEnv('VITE_MEDIAMTX_HOST')
  if (!host) return undefined

  const port = readEnv('VITE_MEDIAMTX_PLAYBACK_PORT') ?? '9996'
  const scheme = typeof window !== 'undefined' && window.location.protocol === 'https:'
    ? 'https'
    : 'http'
  return `${scheme}://${host}:${port}`
}

/**
 * Path MediaMTX của một camera bất kỳ trong Module 05.
 *
 * Drone publish vào `dr03`; bí danh `dr-03` chỉ pull lại và **không ghi băng**
 * (bật ghi cả hai là tốn gấp đôi đĩa cho cùng một hình), nên playback phải hỏi
 * đúng path gốc.
 */
export function mediaMtxPathForCamera(cameraId: string): string {
  const id = cameraId.trim()
  if (id.toUpperCase().startsWith('DR-')) {
    return id.toLowerCase().replace('-', '')
  }
  return getHelmetIngest(id).path
}

/** Base HLS của MediaMTX — fallback khi WebRTC bị chặn (firewall UDP). */
export function getMediaMtxHlsBase(): string | undefined {
  const explicit = readEnv('VITE_MEDIAMTX_HLS_URL')
  if (explicit) return stripTrailingSlash(explicit)

  const host = readEnv('VITE_MEDIAMTX_HOST')
  if (!host) return undefined

  const port = readEnv('VITE_MEDIAMTX_HLS_PORT') ?? '8888'
  const scheme = typeof window !== 'undefined' && window.location.protocol === 'https:'
    ? 'https'
    : 'http'
  return `${scheme}://${host}:${port}`
}

/** Có hạ tầng WebRTC chưa — quyết định dùng pipeline mới hay fallback luồng cũ. */
export function isHelmetWebrtcAvailable(): boolean {
  return Boolean(getMediaMtxWebrtcBase())
}

/** Path MediaMTX mặc định theo helmet: `HC-02` → `hc-02`. */
export function defaultHelmetPath(helmetId: string): string {
  return helmetId.toLowerCase()
}

const RTSP_SOURCES: Record<string, string | undefined> = {
  'HC-01': readEnv('VITE_HC01_RTSP_URL') ?? 'rtsp://157.66.100.182:8554/866926048126915',
}

/** Helmet publish bằng trình duyệt (WHIP) — mặc định HC-02, override bằng env. */
function whipPublishers(): Set<string> {
  const raw = readEnv('VITE_HELMET_WHIP_IDS') ?? 'HC-02'
  return new Set(raw.split(',').map(s => s.trim()).filter(Boolean))
}

/**
 * Cấu hình ingest của một mũ.
 * Khi chưa có MediaMTX, helmet WHIP rơi về `legacy-mobile` để demo cũ vẫn chạy.
 */
export function getHelmetIngest(helmetId: string): HelmetIngestConfig {
  const path = readEnv(`VITE_${helmetId.replace('-', '')}_PATH`) ?? defaultHelmetPath(helmetId)

  if (whipPublishers().has(helmetId)) {
    return {
      helmetId,
      kind: isHelmetWebrtcAvailable() ? 'whip' : 'legacy-mobile',
      path,
    }
  }

  return {
    helmetId,
    kind: 'rtsp',
    path,
    rtspUrl: RTSP_SOURCES[helmetId],
  }
}

/** Endpoint WHIP để thiết bị publish (MediaMTX: `/<path>/whip`). */
export function getHelmetWhipUrl(helmetId: string): string | undefined {
  const base = getMediaMtxWebrtcBase()
  if (!base) return undefined
  return `${base}/${getHelmetIngest(helmetId).path}/whip`
}

/** Endpoint WHEP để CMS xem live (MediaMTX: `/<path>/whep`). */
export function getHelmetWhepUrl(helmetId: string): string | undefined {
  const base = getMediaMtxWebrtcBase()
  if (!base) return undefined
  return `${base}/${getHelmetIngest(helmetId).path}/whep`
}

/** HLS của MediaMTX — fallback khi WebRTC không kết nối được. */
export function getHelmetMediaMtxHlsUrl(helmetId: string): string | undefined {
  const base = getMediaMtxHlsBase()
  if (!base) return undefined
  return `${base}/${getHelmetIngest(helmetId).path}/index.m3u8`
}

/**
 * Helmet còn phải dùng luồng cũ (getUserMedia + POST frame) hay không.
 * Khi MediaMTX sẵn sàng, hàm này trả false và CMS chuyển hẳn sang video server-side.
 */
export function isLegacyMobileHelmet(helmetId: string): boolean {
  return getHelmetIngest(helmetId).kind === 'legacy-mobile'
}

/** Helmet publish từ trình duyệt — dùng cho trang phát sóng. */
export function isBrowserPublishHelmet(helmetId: string): boolean {
  const kind = getHelmetIngest(helmetId).kind
  return kind === 'whip' || kind === 'legacy-mobile'
}

/** Mũ còn phải chạy luồng cũ — CMS phải giữ các nhánh xử lý riêng cho chúng. */
export function legacyMobileHelmetIds(): string[] {
  return PATROL_HELMET_IDS.filter(isLegacyMobileHelmet)
}

/**
 * Còn mũ nào chưa lên pipeline mới không.
 * false → CMS bỏ hết nhánh đặc thù mobile: không popup quyền, không ưu tiên
 * một mũ trên điện thoại, mọi tile hiển thị như nhau.
 */
export function hasLegacyMobileHelmet(): boolean {
  return PATROL_HELMET_IDS.some(isLegacyMobileHelmet)
}
