/** Múi giờ chuẩn VN — đồng bộ tham số giữa mọi trình duyệt / múi giờ máy. */
export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function vnParts(date: Date): { y: string; m: string; d: string; h: string; min: string; s: string } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(p => p.type === type)?.value ?? '00'
  return {
    y: get('year'),
    m: get('month'),
    d: get('day'),
    h: get('hour'),
    min: get('minute'),
    s: get('second'),
  }
}

/** YYYY-MM-DD theo giờ Việt Nam. */
export function formatVnDate(date = new Date()): string {
  const { y, m, d } = vnParts(date)
  return `${y}-${m}-${d}`
}

/** YYYY-MM-DD cách baseYmd (YYYY-MM-DD) n ngày — không phụ thuộc múi giờ máy. */
export function formatVnDateOffsetDays(offsetDays: number, baseYmd?: string): string {
  const base = baseYmd ?? formatVnDate()
  const [y, m, d] = base.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + offsetDays, 12, 0, 0))
  return formatVnDate(shifted)
}

/** ISO local timestamp theo giờ VN (không suffix Z). */
export function formatVnIsoTimestamp(date = new Date()): string {
  const { y, m, d, h, min, s } = vnParts(date)
  return `${y}-${m}-${d}T${h}:${min}:${s}`
}

/** DD/MM/YYYY HH:mm:ss — overlay OSD tile camera (HC-02 / flycam). */
export function formatVnDisplayTimestamp(date = new Date()): string {
  const { y, m, d, h, min, s } = vnParts(date)
  return `${d}/${m}/${y} ${h}:${min}:${s}`
}

/** ISO local timestamp từ unix seconds — giờ VN. */
export function formatVnIsoFromUnix(unixSeconds: number): string {
  return formatVnIsoTimestamp(new Date(unixSeconds * 1000))
}

function readSearchParam(...keys: string[]): string {
  if (typeof window === 'undefined') return ''
  const params = new URLSearchParams(window.location.search)
  for (const key of keys) {
    const raw = params.get(key)?.trim()
    if (raw) return decodeURIComponent(raw)
  }
  return ''
}

const SESSION_EVENT_DATE_KEY = 'vifence_url_event_date'

/** ?date= / ?eventDate= — lưu session để SPA giữ tham số sau khi điều hướng. */
export function getSharedEventDateParam(): string {
  const fromUrl = readSearchParam('date', 'eventDate')
  if (fromUrl && DATE_RE.test(fromUrl)) {
    sessionStorage.setItem(SESSION_EVENT_DATE_KEY, fromUrl)
    return fromUrl
  }
  return sessionStorage.getItem(SESSION_EVENT_DATE_KEY)?.trim() ?? ''
}
