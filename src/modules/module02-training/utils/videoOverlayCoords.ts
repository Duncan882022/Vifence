/** Map bbox trong không gian video (px) → % trên khung object-cover/contain thực tế. */
export function videoRectToOverlayPercent(
  rect: { x: number; y: number; width: number; height: number },
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number,
  fit: 'cover' | 'contain' = 'cover',
  objectPosition: 'center' | 'bottom' = 'center',
): { x: number; y: number; w: number; h: number } {
  if (!videoWidth || !videoHeight || !containerWidth || !containerHeight) {
    return { x: 0, y: 0, w: 0, h: 0 }
  }

  const scale =
    fit === 'cover'
      ? Math.max(containerWidth / videoWidth, containerHeight / videoHeight)
      : Math.min(containerWidth / videoWidth, containerHeight / videoHeight)
  const renderedW = videoWidth * scale
  const renderedH = videoHeight * scale
  const offsetX = (containerWidth - renderedW) / 2
  const offsetY = fit === 'cover' && objectPosition === 'bottom'
    ? containerHeight - renderedH
    : (containerHeight - renderedH) / 2

  const screenX = rect.x * scale + offsetX
  const screenY = rect.y * scale + offsetY
  const screenW = rect.width * scale
  const screenH = rect.height * scale

  return {
    x: (screenX / containerWidth) * 100,
    y: (screenY / containerHeight) * 100,
    w: (screenW / containerWidth) * 100,
    h: (screenH / containerHeight) * 100,
  }
}

export interface VideoIntrinsicFallback {
  width?: number
  height?: number
}

function resolveVideoIntrinsicSize(
  video: HTMLVideoElement,
  fallback?: VideoIntrinsicFallback,
): { width: number; height: number } {
  return {
    width: video.videoWidth || fallback?.width || 0,
    height: video.videoHeight || fallback?.height || 0,
  }
}

/** Map bbox từ phần tử video — cover (CCTV/fly) hoặc contain (body cam). */
export function mapVideoRectToOverlay(
  rect: { x: number; y: number; width: number; height: number },
  video: HTMLVideoElement,
  fit: 'cover' | 'contain' = 'cover',
  objectPosition: 'center' | 'bottom' = 'center',
  intrinsicFallback?: VideoIntrinsicFallback,
): { x: number; y: number; w: number; h: number } {
  const { width, height } = resolveVideoIntrinsicSize(video, intrinsicFallback)
  return videoRectToOverlayPercent(
    rect,
    width,
    height,
    video.clientWidth,
    video.clientHeight,
    fit,
    objectPosition,
  )
}

/** Map điểm chuẩn hoá 0–1 trên khung video → % overlay (object-cover/contain). */
export function mapVideoPointToOverlay(
  nx: number,
  ny: number,
  video: HTMLVideoElement,
  fit: 'cover' | 'contain' = 'cover',
  objectPosition: 'center' | 'bottom' = 'center',
): { x: number; y: number } {
  const pt = mapVideoRectToOverlay(
    { x: nx * video.videoWidth, y: ny * video.videoHeight, width: 1, height: 1 },
    video,
    fit,
    objectPosition,
  )
  return { x: pt.x, y: pt.y }
}

/** Kích thước khung nguồn — ưu tiên metadata video, fallback frame BE (VMS/HLS). */
export function resolveOverlayIntrinsicSize(
  video: HTMLVideoElement | null | undefined,
  frameWidth: number,
  frameHeight: number,
): { width: number; height: number; containerWidth: number; containerHeight: number } {
  const width = video?.videoWidth || frameWidth
  const height = video?.videoHeight || frameHeight
  const containerWidth = video?.clientWidth ?? 0
  const containerHeight = video?.clientHeight ?? 0
  return { width, height, containerWidth, containerHeight }
}

/** Polygon ROI chuẩn hoá 0–1 → chuỗi points SVG (% viewBox 0–100). */
export function mapNormalizedPolygonToOverlay(
  polygon: Array<{ x: number; y: number }>,
  video: HTMLVideoElement | null | undefined,
  frameWidth: number,
  frameHeight: number,
  fit: 'cover' | 'contain' = 'cover',
  objectPosition: 'center' | 'bottom' = 'center',
): string {
  const { width, height, containerWidth, containerHeight } = resolveOverlayIntrinsicSize(
    video,
    frameWidth,
    frameHeight,
  )
  if (!width || !height || !containerWidth || !containerHeight) return ''

  return polygon
    .map(p => {
      const pt = videoRectToOverlayPercent(
        { x: p.x * width, y: p.y * height, width: 1, height: 1 },
        width,
        height,
        containerWidth,
        containerHeight,
        fit,
        objectPosition,
      )
      return `${pt.x},${pt.y}`
    })
    .join(' ')
}

export interface VideoSourceRect {
  x: number
  y: number
  width: number
  height: number
}

/** Vùng pixel nguồn thực sự hiển thị trong thẻ video (object-cover/contain). */
export function getVisibleVideoSourceRect(
  video: HTMLVideoElement,
  fit: 'cover' | 'contain' = 'cover',
  objectPosition: 'center' | 'bottom' = 'center',
  intrinsicFallback?: VideoIntrinsicFallback,
): VideoSourceRect {
  const { width: vw, height: vh } = resolveVideoIntrinsicSize(video, intrinsicFallback)
  const cw = video.clientWidth
  const ch = video.clientHeight
  if (!vw || !vh || !cw || !ch) {
    return { x: 0, y: 0, width: vw || 0, height: vh || 0 }
  }
  if (fit === 'contain') {
    return { x: 0, y: 0, width: vw, height: vh }
  }

  const scale = Math.max(cw / vw, ch / vh)
  const renderedW = vw * scale
  const renderedH = vh * scale
  const offsetX = (cw - renderedW) / 2
  const offsetY = objectPosition === 'bottom'
    ? ch - renderedH
    : (ch - renderedH) / 2
  const srcX = Math.max(0, -offsetX / scale)
  const srcY = Math.max(0, -offsetY / scale)
  const srcW = Math.min(vw - srcX, cw / scale)
  const srcH = Math.min(vh - srcY, ch / scale)
  return { x: srcX, y: srcY, width: srcW, height: srcH }
}

/** Bbox 0–1 (Module 05 WS) vs pixel — ngưỡng giống backend `detector.py`. */
export function isNormalizedBbox(bbox: [number, number, number, number]): boolean {
  return Math.max(...bbox.map(v => Math.abs(v))) <= 1.5
}

/** Chuyển bbox chuẩn hoá → pixel theo kích thước khung gốc. */
export function bboxToPixelSpace(
  bbox: [number, number, number, number],
  frameWidth: number,
  frameHeight: number,
): [number, number, number, number] {
  if (!isNormalizedBbox(bbox) || frameWidth <= 0 || frameHeight <= 0) {
    return bbox
  }
  const [x1, y1, x2, y2] = bbox
  return [x1 * frameWidth, y1 * frameHeight, x2 * frameWidth, y2 * frameHeight]
}

/** Bbox từ backend (pixel hoặc 0–1) → % overlay trên video đang hiển thị. */
export function mapBackendBboxToOverlay(
  bbox: [number, number, number, number],
  frameWidth: number,
  frameHeight: number,
  video: HTMLVideoElement,
  fit: 'cover' | 'contain' = 'cover',
  objectPosition: 'center' | 'bottom' = 'center',
): { x: number; y: number; w: number; h: number } {
  const analyzeW = frameWidth > 0 ? frameWidth : (video.videoWidth || 0)
  const analyzeH = frameHeight > 0 ? frameHeight : (video.videoHeight || 0)
  const displayW = video.videoWidth || analyzeW
  const displayH = video.videoHeight || analyzeH
  const intrinsicFallback = { width: displayW, height: displayH }

  let [x1, y1, x2, y2] = bboxToPixelSpace(bbox, analyzeW, analyzeH)
  // Snapshot VMS / JPEG analyze có thể khác aspect `<video>` (HC-02 dọc trên mobile).
  if (analyzeW > 0 && analyzeH > 0 && displayW > 0 && displayH > 0
    && (analyzeW !== displayW || analyzeH !== displayH)) {
    const sx = displayW / analyzeW
    const sy = displayH / analyzeH
    x1 *= sx
    y1 *= sy
    x2 *= sx
    y2 *= sy
  }

  // Bbox đã ở hệ toạ độ khung hình đầy đủ. `mapVideoRectToOverlay` tự cắt phần
  // bị `object-cover` che qua offset âm, nên không được ép bbox vào vùng còn
  // nhìn thấy trước: làm vậy là chiếu hai lần, hộp co dần về tâm và lệch càng
  // nhiều khi vật ở gần mép.
  return mapVideoRectToOverlay(
    { x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
    video,
    fit,
    objectPosition,
    intrinsicFallback,
  )
}

/**
 * Kích thước khung analyze (VMS snapshot / JPEG local).
 * Luôn giữ metadata analyze cho không gian bbox; `mapBackendBboxToOverlay`
 * tự scale sang intrinsic `<video>` khi aspect khác (bodycam dọc trên mobile).
 */
export function resolveOverlayAnalyzeFrameSize(
  video: HTMLVideoElement | null | undefined,
  analyzeWidth: number,
  analyzeHeight: number,
): { width: number; height: number } {
  const vw = video?.videoWidth ?? 0
  const vh = video?.videoHeight ?? 0

  if (analyzeWidth > 0 && analyzeHeight > 0) {
    return { width: analyzeWidth, height: analyzeHeight }
  }

  return { width: vw, height: vh }
}
