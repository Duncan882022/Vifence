import { useState } from 'react'
import { cn } from '@/utils/cn'
import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import type { CameraDetection } from '@/types/cameraPlayback'
import { CameraPlaybackThumb } from './CameraPlaybackThumb'
import { PlaybackDetectionsList } from './PlaybackDetectionsList'

interface PlaybackMobileStripProps {
  cameras: TrainingCamera[]
  selectedIds: string[]
  onThumbClick: (cam: TrainingCamera) => void
  detections: CameraDetection[]
  loadingDetections: boolean
  sidebarGroups: { key: string; cameras: TrainingCamera[] }[]
  locationFilterTabs?: string[]
  locationTab?: string
  onLocationTabChange?: (tab: string) => void
}

export function PlaybackMobileStrip({
  cameras,
  selectedIds,
  onThumbClick,
  detections,
  loadingDetections,
  sidebarGroups,
  locationFilterTabs,
  locationTab,
  onLocationTabChange,
}: PlaybackMobileStripProps) {
  const [tab, setTab] = useState<'camera' | 'ai'>('camera')
  const hasLocationTabs = Boolean(locationFilterTabs?.length && onLocationTabChange)

  return (
    <div className="rounded-lg border border-[#1e2433] bg-[#060b14] shrink-0 overflow-hidden">
      <div className="flex border-b border-[#1e2433]">
        <button
          type="button"
          onClick={() => setTab('camera')}
          className={cn(
            'flex-1 px-2 py-2 text-[9px] font-bold uppercase tracking-wide transition-colors',
            tab === 'camera'
              ? 'text-amber-400 border-b-2 border-amber-400/80 bg-amber-500/5'
              : 'text-muted-foreground/60 hover:text-foreground',
          )}
        >
          Camera ({cameras.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('ai')}
          className={cn(
            'flex-1 px-2 py-2 text-[9px] font-bold uppercase tracking-wide transition-colors',
            tab === 'ai'
              ? 'text-amber-400 border-b-2 border-amber-400/80 bg-amber-500/5'
              : 'text-muted-foreground/60 hover:text-foreground',
          )}
        >
          AI ({detections.length})
        </button>
      </div>
      <div className="p-2">
        {tab === 'camera' ? (
          <div className="min-w-0">
            {hasLocationTabs && (
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0 mb-2 pb-1 border-b border-[#1e2433]">
                {locationFilterTabs!.map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => onLocationTabChange!(item)}
                    className={cn(
                      'px-1.5 py-0.5 text-[8px] font-semibold rounded whitespace-nowrap transition-colors shrink-0',
                      locationTab === item
                        ? 'bg-primary/20 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-[#1a2235]',
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
            <div className="max-h-[min(36vh,280px)] overflow-y-auto overflow-x-hidden overscroll-y-contain">
              <div className="flex flex-col gap-2 min-w-0">
                {sidebarGroups.map(({ key, cameras: groupCams }) => (
                  <div key={key} className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-1 min-w-0">
                      <span className="text-[8px] font-bold text-muted-foreground/70 uppercase tracking-widest truncate min-w-0">
                        {key}
                      </span>
                      <div className="flex-1 h-px bg-[#1e2433] shrink-0" />
                      <span className="text-[8px] text-muted-foreground/40 shrink-0">{groupCams.length}</span>
                    </div>
                    <div className="grid grid-cols-3 max-[360px]:grid-cols-2 gap-1 min-w-0 overflow-x-hidden">
                      {groupCams.map(cam => (
                        <CameraPlaybackThumb
                          key={cam.id}
                          cam={cam}
                          selected={selectedIds.includes(cam.id)}
                          onClick={() => onThumbClick(cam)}
                          compact
                          variant="playback"
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <PlaybackDetectionsList detections={detections} loading={loadingDetections} embedded />
        )}
      </div>
    </div>
  )
}
