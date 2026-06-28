/** Map bbox trong không gian video (px) → % trên khung object-cover thực tế. */
export function videoRectToOverlayPercent(
  rect: { x: number; y: number; width: number; height: number },
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number,
  fit: 'cover' | 'contain' = 'cover',
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
  const offsetY = (containerHeight - renderedH) / 2

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
): { x: number; y: number; w: number; h: number } {
  return videoRectToOverlayPercent(
    rect,
    video.videoWidth,
    video.videoHeight,
    video.clientWidth,
    video.clientHeight,
    fit,
  )
}
