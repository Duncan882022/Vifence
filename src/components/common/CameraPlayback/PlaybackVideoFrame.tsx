import type { RefObject } from 'react'
import dayjs from 'dayjs'
import { Camera, Radio } from 'lucide-react'
import { cn } from '@/utils/cn'
import { cameraDisplayLabel, type TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import {
  getVideoObjectFitForCamera,
  getVideoObjectPositionForCamera,
} from '@/modules/module02-training/data/trainingCameraFeeds'
import type { CameraPlaybackRecord } from '@/types/cameraPlayback'
import { getCameraLocation as getLocation } from '@/utils/cameraPlaybackUi'
import { EventPlaybackViewport } from '@/modules/module03-safety/components/EventPlaybackViewport'
import { playbackViolationRoiClass } from '@/modules/module03-safety/utils/roiBoxRole'
import { SEVERITY_BADGE, SEVERITY_ICONS, SEVERITY_LABELS_UI } from '@/modules/module03-safety/utils/safetyDashboardUi'
import type { SafetyViolationRecord } from '@/modules/module03-safety/types/safety.types'
import { TagTooltip } from '@/components/common/IconTooltip/IconTooltip'

const CCTV_SCANLINE = {
  backgroundImage:
    'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 4px)',
} as const

interface PlaybackVideoFrameProps {
  cam: TrainingCamera
  videoSrc: string | null
  loadingRecords: boolean
  selectedRecord: CameraPlaybackRecord | null
  videoRef: RefObject<HTMLVideoElement | null>
  muted: boolean
  activeEventRecord?: SafetyViolationRecord | null
}

export function PlaybackVideoFrame({
  cam,
  videoSrc,
  loadingRecords,
  selectedRecord,
  videoRef,
  muted,
  activeEventRecord,
}: PlaybackVideoFrameProps) {
  const location = getLocation(cam)
  const isEventClip = selectedRecord?.type === 'event'
  const playbackFit = getVideoObjectFitForCamera(cam.id)
  const playbackObjectPosition = getVideoObjectPositionForCamera(cam.id)
  const clipSec = selectedRecord?.clipDurationSec ?? 3
  const eventMeta = activeEventRecord ?? null
  const SeverityIcon = eventMeta ? SEVERITY_ICONS[eventMeta.severity] : null

  return (
    <div className="relative w-full h-full min-h-[120px] overflow-hidden rounded-lg bg-[#060b14] border border-[#1e2433]">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f1922] via-[#0a1219] to-[#060d14]" />
      {videoSrc ? (
        isEventClip ? (
          <EventPlaybackViewport
            videoRef={videoRef}
            bbox={selectedRecord?.violationBbox}
            subjectBbox={selectedRecord?.subjectBbox}
            relatedBbox={selectedRecord?.relatedBbox}
            relatedRoiLabel={selectedRecord?.relatedRoiLabel}
            frameWidth={selectedRecord?.frameWidth}
            frameHeight={selectedRecord?.frameHeight}
            videoFit={playbackFit}
            videoObjectPosition={playbackObjectPosition}
            zoomEnabled={false}
            violationRoiClass={playbackViolationRoiClass(activeEventRecord?.scenarioId)}
            className="z-[1]"
          >
            <video
              ref={videoRef}
              src={videoSrc}
              className={cn(
                'absolute inset-0 w-full h-full bg-black',
                playbackFit === 'contain' ? 'object-contain' : 'object-cover',
                playbackObjectPosition === 'bottom' && playbackFit === 'cover' && 'object-bottom',
              )}
              muted={muted}
              playsInline
              preload="auto"
            />
          </EventPlaybackViewport>
        ) : (
          <video
            ref={videoRef}
            src={videoSrc}
            className="absolute inset-0 w-full h-full object-contain z-[1]"
            muted={muted}
            playsInline
            preload="auto"
          />
        )
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground/40 z-[1]">
          <Camera className="w-8 h-8" />
          <span className="text-[9px]">
            {loadingRecords ? 'Đang tải bản ghi...' : 'Không có bản ghi trong ngày này'}
          </span>
        </div>
      )}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none z-[2]" style={CCTV_SCANLINE} />

      <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-1.5 z-20 pointer-events-none">
        <div className="flex flex-col gap-1 min-w-0">
          {isEventClip && eventMeta && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-black/65 text-white/95 border border-white/10 font-mono">
                {eventMeta.scenarioId}
              </span>
              {SeverityIcon && (
                <TagTooltip content={SEVERITY_LABELS_UI[eventMeta.severity]}>
                  <span className={cn(
                    'w-5 h-5 rounded border inline-flex items-center justify-center bg-black/55',
                    SEVERITY_BADGE[eventMeta.severity],
                  )}>
                    <SeverityIcon className="w-2.5 h-2.5" aria-hidden />
                  </span>
                </TagTooltip>
              )}
            </div>
          )}
          {selectedRecord && (
            <div className="min-w-0 bg-black/60 rounded px-2 py-1 border border-[#1e2433] max-w-[70%]">
              <p className="text-[8px] text-white/90 font-semibold truncate">{selectedRecord.name}</p>
              <p className="text-[7px] text-white/45 tabular-nums">
                {isEventClip
                  ? `Clip ${clipSec}s · ${dayjs(selectedRecord.startTime).format('HH:mm:ss')}`
                  : (
                    <>
                      {dayjs(selectedRecord.startTime).format('HH:mm:ss')}
                      {' – '}
                      {dayjs(selectedRecord.endTime).format('HH:mm:ss')}
                    </>
                  )}
              </p>
            </div>
          )}
        </div>
        {isEventClip && (
          <span className="inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-500/90 text-white shrink-0">
            <Radio className="w-2.5 h-2.5 animate-pulse" aria-hidden />
            AI
          </span>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent z-20 px-3 pt-10 pb-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-white tracking-wide truncate text-[13px]">
            {cameraDisplayLabel(cam)}
          </span>
          {location && location !== 'Khác' && (
            <span className="shrink-0 bg-blue-500/25 border border-blue-500/40 text-blue-200 rounded-full font-medium text-[9px] px-2.5 py-0.5">
              {location}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
