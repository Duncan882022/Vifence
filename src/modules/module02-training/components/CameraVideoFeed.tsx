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
  /** Bật AI detect + vẽ box — chỉ dùng trên luồng đang chọn (grid chính) */
  aiOverlay?: boolean
  /** Thu nhỏ label overlay — vẫn hiển thị detect */
  compact?: boolean
}

export function CameraVideoFeed({
  cameraId,
  zone,
  courseName,
  streamType = 'fixed',
  src,
  playing = true,
  aiOverlay = false,
  compact,
}: CameraVideoFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const feedKey = getFeedKeyForCamera(cameraId)
  const showOverlay = Boolean(aiOverlay && feedKey)

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
    <div className="absolute inset-0 overflow-hidden">
      <video
        ref={videoRef}
        src={src}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className={cn(
          'absolute inset-0 h-full w-full',
          streamType === 'bodycam' ? 'object-contain bg-black' : 'object-cover',
          'saturate-[0.82] contrast-[1.06] brightness-[0.9]',
        )}
      />
      {showOverlay && feedKey && (
        <CameraAiOverlay
          feedKey={feedKey}
          cameraId={cameraId}
          zone={zone}
          courseName={courseName}
          compact={compact}
          videoRef={videoRef}
          enabled={playing && aiOverlay}
        />
      )}
    </div>
  )
}
