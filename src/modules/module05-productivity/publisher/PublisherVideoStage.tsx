import { memo } from 'react'
import { Camera, SwitchCamera } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { CameraFacing } from '@/modules/module02-training/services/deviceCamera.service'

function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}

export interface PublisherVideoStageProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  /** Camera đã có khung hình — tách khỏi trạng thái WebRTC để không nháy khi nối lại. */
  previewReady: boolean
  isLive: boolean
  /** WHIP đang bắt tay / nối lại — overlay mờ, không ẩn video. */
  showReconnectOverlay: boolean
  elapsedSec: number
  facing: CameraFacing
  onFlipCamera: () => void
}

export const PublisherVideoStage = memo(function PublisherVideoStage({
  videoRef,
  previewReady,
  isLive,
  showReconnectOverlay,
  elapsedSec,
  facing,
  onFlipCamera,
}: PublisherVideoStageProps) {
  const facingLabel = facing === 'environment' ? 'Camera sau' : 'Camera trước'

  return (
    <div className="relative aspect-[3/4] max-h-[40dvh] w-full overflow-hidden rounded-xl border border-[#1f2937] bg-black shadow-lg shadow-black/40">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={cn(
          'absolute inset-0 h-full w-full object-cover',
          'transition-opacity duration-300 ease-out',
          '[transform:translateZ(0)]',
          previewReady ? 'opacity-100' : 'opacity-0',
        )}
      />

      <div
        className={cn(
          'absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#64748b]',
          'transition-opacity duration-300 ease-out',
          previewReady ? 'pointer-events-none opacity-0' : 'opacity-100',
        )}
        aria-hidden={previewReady}
      >
        <Camera className="w-10 h-10 opacity-40" />
        <span className="text-[11px]">
          {previewReady ? '' : 'Đang mở camera…'}
        </span>
      </div>

      {showReconnectOverlay && previewReady && (
        <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 bg-black/45 backdrop-blur-[1px]">
          <div className="w-5 h-5 border-2 border-white/25 border-t-white/80 rounded-full animate-spin" />
          <span className="text-[11px] font-medium text-white/90">Đang nối lại máy chủ…</span>
        </div>
      )}

      {isLive && (
        <>
          <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/65 px-2 py-1 backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-bold tracking-wide text-white">LIVE</span>
          </div>
          <div className="absolute top-3 right-3 rounded-full bg-black/65 px-2 py-1 text-[10px] text-white/90 backdrop-blur-sm tabular-nums">
            {formatDuration(elapsedSec)}
          </div>
          <button
            type="button"
            onClick={onFlipCamera}
            aria-label="Đổi camera trước/sau"
            className="absolute bottom-3 right-3 rounded-full bg-black/65 p-2.5 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/85 active:scale-95"
          >
            <SwitchCamera className="w-4 h-4" aria-hidden />
          </button>
          <div className="absolute bottom-3 left-3 rounded-full bg-black/65 px-2 py-1 text-[10px] text-white/80 backdrop-blur-sm">
            {facingLabel}
          </div>
        </>
      )}
    </div>
  )
})
