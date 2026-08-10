import type { RefObject } from 'react'
import { mapBackendBboxToOverlay } from '@/modules/module02-training/utils/videoOverlayCoords'

type Bbox = [number, number, number, number]

export interface MappedOverlayBox {
  x: number
  y: number
  w: number
  h: number
}

export function mapBboxToOverlayBox(
  bbox: Bbox,
  frameWidth: number,
  frameHeight: number,
  videoRef: RefObject<HTMLVideoElement | null>,
  videoFit: 'cover' | 'contain',
  videoObjectPosition: 'center' | 'bottom' = 'center',
): MappedOverlayBox | null {
  const video = videoRef.current
  if (!video?.videoWidth || !video.videoHeight || frameWidth <= 0 || frameHeight <= 0) {
    return null
  }
  const box = mapBackendBboxToOverlay(
    bbox,
    frameWidth,
    frameHeight,
    video,
    videoFit,
    videoObjectPosition,
  )
  if (box.w <= 0.5 || box.h <= 0.5) return null
  return box
}

export function mapRelativeInnerToOverlay(
  relative: { x: number; y: number; w: number; h: number },
  outer: MappedOverlayBox,
): MappedOverlayBox {
  return {
    x: outer.x + (relative.x / 100) * outer.w,
    y: outer.y + (relative.y / 100) * outer.h,
    w: (relative.w / 100) * outer.w,
    h: (relative.h / 100) * outer.h,
  }
}
