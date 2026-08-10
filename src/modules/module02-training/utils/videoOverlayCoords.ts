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

/** Map bbox từ phần tử video — cover (CCTV/fly) hoặc contain (body cam). */
export function mapVideoRectToOverlay(
  rect: { x: number; y: number; width: number; height: number },
  video: HTMLVideoElement,
  fit: 'cover' | 'contain' = 'cover',
  objectPosition: 'center' | 'bottom' = 'center',
): { x: number; y: number; w: number; h: number } {
  return videoRectToOverlayPercent(
    rect,
    video.videoWidth,
    video.videoHeight,
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
): VideoSourceRect {
  const vw = video.videoWidth
  const vh = video.videoHeight
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

/** Bbox từ backend (theo frame đã chụp) → % overlay trên video đang hiển thị. */
export function mapBackendBboxToOverlay(
  bbox: [number, number, number, number],
  frameWidth: number,
  frameHeight: number,
  video: HTMLVideoElement,
  fit: 'cover' | 'contain' = 'cover',
  objectPosition: 'center' | 'bottom' = 'center',
): { x: number; y: number; w: number; h: number } {
  const [x1, y1, x2, y2] = bbox
  const visible = getVisibleVideoSourceRect(video, fit, objectPosition)
  const scaleX = frameWidth > 0 ? visible.width / frameWidth : 1
  const scaleY = frameHeight > 0 ? visible.height / frameHeight : 1
  return mapVideoRectToOverlay(
    {
      x: visible.x + x1 * scaleX,
      y: visible.y + y1 * scaleY,
      width: (x2 - x1) * scaleX,
      height: (y2 - y1) * scaleY,
    },
    video,
    fit,
    objectPosition,
  )
}
