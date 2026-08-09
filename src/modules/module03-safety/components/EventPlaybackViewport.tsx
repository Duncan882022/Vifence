import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { cn } from '@/utils/cn'
import { useShellLayout } from '@/hooks/useShellLayout'
import {
  bboxOverlayStyle,
  buildEventClipWindow,
  computeBboxZoomStyle,
  type ViolationBbox,
} from '../utils/eventPlaybackClip'

interface EventPlaybackViewportProps {
  bbox?: ViolationBbox
  frameWidth?: number
  frameHeight?: number
  /** Bật zoom ROI — desktop mặc định; mobile/tablet chỉ khung ROI. */
  zoomEnabled?: boolean
  className?: string
  children: ReactNode
}

export function EventPlaybackViewport({
  bbox,
  frameWidth,
  frameHeight,
  zoomEnabled,
  className,
  children,
}: EventPlaybackViewportProps) {
  const { isDesktop } = useShellLayout()
  const allowZoom = zoomEnabled ?? isDesktop

  const zoomStyle = useMemo(() => {
    if (!allowZoom || !bbox || !frameWidth || !frameHeight) return undefined
    return computeBboxZoomStyle(bbox, frameWidth, frameHeight, isDesktop ? 2.6 : 1.35)
  }, [allowZoom, bbox, frameWidth, frameHeight, isDesktop])

  const roiStyle = useMemo(() => {
    if (!bbox || !frameWidth || !frameHeight) return undefined
    return bboxOverlayStyle(bbox, frameWidth, frameHeight)
  }, [bbox, frameWidth, frameHeight])

  return (
    <div className={cn('absolute inset-0 overflow-hidden', className)}>
      <div
        className={cn(
          'absolute inset-0',
          zoomStyle && 'will-change-transform',
        )}
        style={zoomStyle}
      >
        {children}
        {roiStyle && (
          <div
            className="absolute border-2 border-red-400/95 rounded-sm pointer-events-none z-[6] shadow-[0_0_10px_rgba(248,113,113,0.35)]"
            style={roiStyle}
            aria-hidden
          />
        )}
      </div>
    </div>
  )
}

interface UseEventClipPlaybackOptions {
  enabled: boolean
  videoSrc?: string | null
  seekSec: number
  clipDurationSec?: number
  autoPlay?: boolean
  onClipProgress?: (currentInClip: number, clipDuration: number) => void
  onClipReady?: (clipStart: number, clipEnd: number) => void
}

export function useEventClipPlayback(
  videoRef: RefObject<HTMLVideoElement | null>,
  {
    enabled,
    videoSrc,
    seekSec,
    clipDurationSec = 3,
    autoPlay = true,
    onClipProgress,
    onClipReady,
  }: UseEventClipPlaybackOptions,
) {
  const clipRef = useRef({ start: 0, end: clipDurationSec, duration: clipDurationSec })

  useEffect(() => {
    const video = videoRef.current
    if (!video || !enabled || !videoSrc) return

    const applyClip = () => {
      const dur = video.duration
      if (!Number.isFinite(dur) || dur <= 0) return
      const clip = buildEventClipWindow(seekSec, dur, clipDurationSec)
      clipRef.current = clip
      video.currentTime = clip.start
      onClipReady?.(clip.start, clip.end)
      onClipProgress?.(0, clip.duration)
      if (autoPlay) {
        video.muted = true
        void video.play().catch(() => {})
      }
    }

    const onLoaded = () => applyClip()
    video.addEventListener('loadedmetadata', onLoaded)
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) applyClip()

    return () => video.removeEventListener('loadedmetadata', onLoaded)
  }, [videoRef, enabled, videoSrc, seekSec, clipDurationSec, autoPlay, onClipProgress, onClipReady])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !enabled || !videoSrc) return

    const onTimeUpdate = () => {
      const clip = clipRef.current
      if (video.currentTime >= clip.end - 0.04) {
        video.currentTime = clip.start
      }
      onClipProgress?.(
        Math.max(0, video.currentTime - clip.start),
        clip.duration,
      )
    }

    video.addEventListener('timeupdate', onTimeUpdate)
    return () => video.removeEventListener('timeupdate', onTimeUpdate)
  }, [videoRef, enabled, videoSrc, onClipProgress])
}
