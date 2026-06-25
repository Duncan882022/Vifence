import { useEffect, useRef } from 'react'
import { cn } from '@/utils/cn'
import { CameraAiOverlay } from './CameraAiOverlay'
import { getFeedKeyForCamera } from '../data/trainingCameraFeeds'

interface CameraVideoFeedProps {
  cameraId: string
  zone: string
  courseName?: string
  streamType?: 'fixed' | 'bodycam' | 'flycam'
  src: string
  playing?: boolean
  /** Ẩn overlay AI trên thumbnail */
  compact?: boolean
}

export function CameraVideoFeed({
  cameraId,
  zone,
  courseName,
  streamType = 'fixed',
  src,
  playing = true,
  compact,
}: CameraVideoFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const feedKey = getFeedKeyForCamera(cameraId)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (playing) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [src, playing])

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className={cn(
          'absolute inset-0 h-full w-full object-cover',
          'scale-[1.04] saturate-[0.82] contrast-[1.06] brightness-[0.9]',
        )}
      />
      {feedKey && !compact && streamType === 'fixed' && (
        <CameraAiOverlay
          feedKey={feedKey}
          cameraId={cameraId}
          zone={zone}
          courseName={courseName}
        />
      )}
    </>
  )
}
