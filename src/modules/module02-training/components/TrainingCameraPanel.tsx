import { useState, useEffect } from 'react'
import { Maximize2, X, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useShellLayout } from '@/hooks/useShellLayout'
import { CameraVideoFeed } from './CameraVideoFeed'
import {
  CAMERA_FILTER_TABS,
  DEFAULT_COURSE_CAMERA_IDS,
  MOCK_TRAINING_CAMERAS,
  cameraDisplayLabel,
  cameraMetaLabel,
  filterCameras,
  groupCamerasForSidebar,
  isDefaultCourseCamera,
  streamTypeBadge,
  type CameraFilterTab,
  type TrainingCamera,
} from '../data/trainingCameras'

const CCTV_SCANLINE = {
  backgroundImage:
    'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 4px)',
} as const

function CameraLiveFeed({ cam, playing = true, compact }: {
  cam: TrainingCamera; playing?: boolean; compact?: boolean
}) {
  if (!cam.streamUrl) return null
  return (
    <CameraVideoFeed
      src={cam.streamUrl}
      cameraId={cam.id}
      zone={cam.zone}
      courseName={cam.streamType === 'fixed' ? cam.courseName : undefined}
      streamType={cam.streamType}
      playing={playing}
      compact={compact}
    />
  )
}

function CameraThumb({ cam, selected, onClick, compact = false, strip = false }: {
  cam: TrainingCamera; selected: boolean; onClick: () => void; compact?: boolean; strip?: boolean
}) {
  const badge = streamTypeBadge(cam)

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative aspect-video overflow-hidden cursor-pointer border-2 transition-all shrink-0 group',
        strip ? 'w-[72px]' : 'w-full',
        compact ? 'rounded-sm' : 'rounded',
        selected
          ? 'border-primary shadow-[0_0_0_1px] shadow-primary/30'
          : 'border-[#1e2433] hover:border-primary/50',
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f1922] via-[#0a1219] to-[#060d14]" />
      <CameraLiveFeed cam={cam} compact />
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={CCTV_SCANLINE} />

      <span className="absolute top-0.5 left-0.5 flex items-center gap-0.5">
        <span className={cn('rounded-full bg-red-500 animate-pulse', compact ? 'w-0.5 h-0.5' : 'w-1 h-1')} />
        <span className={cn('text-red-400 font-bold tracking-tight', compact ? 'text-[5px]' : 'text-[7px]')}>LIVE</span>
      </span>

      {badge && (
        <span className={cn(
          'absolute font-bold rounded bg-amber-500/30 text-amber-200 border border-amber-500/40',
          compact ? 'top-0.5 right-5 text-[5px] px-0.5 py-px' : 'top-1 right-7 text-[6px] px-1 py-px',
        )}>
          {badge}
        </span>
      )}

      <div className={cn(
        'absolute top-0.5 right-0.5 rounded-sm border-2 flex items-center justify-center transition-all',
        compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5',
        selected
          ? 'bg-primary border-primary'
          : 'border-white/30 bg-black/30 opacity-0 group-hover:opacity-100',
      )}>
        {selected && <Check className={cn('text-white', compact ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5')} strokeWidth={3} />}
      </div>

      <div className={cn(
        'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/75 to-transparent',
        compact ? 'px-1 pb-1 pt-2' : 'px-1.5 pb-1.5 pt-4',
      )}>
        <p className={cn(
          'text-white/90 font-semibold truncate leading-snug',
          compact ? 'text-[6.5px]' : 'text-[9px]',
        )}>
          {cameraDisplayLabel(cam)}
        </p>
        {cameraMetaLabel(cam) && (
          <p className={cn(
            'text-blue-300/80 truncate leading-tight',
            compact ? 'text-[5.5px]' : 'text-[7.5px]',
          )}>
            {cameraMetaLabel(cam)}
          </p>
        )}
      </div>
    </div>
  )
}

function CameraCell({ cam, compact, onMaximize }: {
  cam: TrainingCamera; compact?: boolean; onMaximize: () => void
}) {
  const badge = streamTypeBadge(cam)

  return (
    <div className="relative w-full h-full overflow-hidden rounded-lg bg-[#060b14] border border-[#1e2433]">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f1922] via-[#0a1219] to-[#060d14]" />
      <CameraLiveFeed cam={cam} compact={compact} />
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={CCTV_SCANLINE} />

      <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-1">
        <div className="flex items-center gap-1 min-w-0">
          <span className={cn(
            'bg-red-500/90 text-white font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0',
            compact ? 'text-[8px]' : 'text-[10px]',
          )}>
            <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
            LIVE
          </span>
          {badge && (
            <span className={cn(
              'shrink-0 font-bold px-1.5 py-0.5 rounded border',
              cam.streamType === 'flycam'
                ? 'bg-violet-500/25 border-violet-500/40 text-violet-200'
                : 'bg-amber-500/25 border-amber-500/40 text-amber-200',
              compact ? 'text-[7px]' : 'text-[8px]',
            )}>
              {badge}
            </span>
          )}
        </div>
        <button
          onClick={onMaximize}
          className="p-1 rounded bg-black/50 hover:bg-black/80 text-white transition-colors shrink-0"
          title="Phóng to"
        >
          <Maximize2 className={compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />
        </button>
      </div>

      <div className={cn(
        'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent',
        compact ? 'px-2 pt-5 pb-1.5' : 'px-3 pt-10 pb-3',
      )}>
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            'font-semibold text-white tracking-wide truncate',
            compact ? 'text-[9px]' : 'text-[13px]',
          )}>
            {cameraDisplayLabel(cam)}
          </span>
          {cameraMetaLabel(cam) && cam.streamType === 'fixed' && (
            <span className={cn(
              'shrink-0 bg-blue-500/25 border border-blue-500/40 text-blue-200 rounded-full font-medium',
              compact ? 'text-[7px] px-1.5 py-0.5' : 'text-[9px] px-2.5 py-0.5',
            )}>
              {cameraMetaLabel(cam)}
            </span>
          )}
          {cameraMetaLabel(cam) && cam.streamType !== 'fixed' && (
            <span className={cn(
              'shrink-0 rounded-full font-medium border text-muted-foreground/80',
              cam.streamType === 'flycam'
                ? 'bg-violet-500/15 border-violet-500/30'
                : 'bg-amber-500/15 border-amber-500/30',
              compact ? 'text-[7px] px-1.5 py-0.5' : 'text-[9px] px-2.5 py-0.5',
            )}>
              {cameraMetaLabel(cam)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function getGridCols(count: number, stackedPortrait: boolean, forceSingleCol = false): number {
  if (forceSingleCol || count === 1) return 1
  if (stackedPortrait && count <= 4) return 1
  if (count <= 4) return 2
  if (count <= 9) return 3
  return 4
}

function CameraGrid({ cams, onMaximize, stackedPortrait, fillHeight, forceSingleCol }: {
  cams: TrainingCamera[]
  onMaximize: (cam: TrainingCamera) => void
  stackedPortrait: boolean
  fillHeight: boolean
  forceSingleCol?: boolean
}) {
  const count = cams.length
  const cols = getGridCols(count, stackedPortrait, forceSingleCol)
  const compact = count > 2

  return (
    <div
      className={cn(
        'grid gap-1.5 w-full',
        fillHeight ? 'h-full min-h-0' : 'h-auto content-start',
        stackedPortrait && 'max-lg:overflow-visible',
      )}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {cams.map(cam => (
        <div
          key={cam.id}
          className={cn(
            'relative w-full min-w-0 shrink-0',
            fillHeight ? 'h-full min-h-[120px]' : 'aspect-video',
          )}
        >
          <CameraCell cam={cam} compact={compact} onMaximize={() => onMaximize(cam)} />
        </div>
      ))}
    </div>
  )
}

function FullscreenOverlay({ cam, onClose }: { cam: TrainingCamera | null; onClose: () => void }) {
  useEffect(() => {
    if (!cam) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [cam, onClose])

  if (!cam) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center backdrop-blur-sm" onClick={onClose}>
      <div className="relative flex flex-col gap-2" style={{ width: '80vw', height: '75vh' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="bg-red-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
            </span>
            <span className="text-sm font-semibold text-white truncate">{cameraDisplayLabel(cam)}</span>
            {cameraMetaLabel(cam) && (
              <span className="text-xs text-white/60 truncate">— {cameraMetaLabel(cam)}</span>
            )}
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <CameraCell cam={cam} onMaximize={onClose} />
        </div>
      </div>
    </div>
  )
}

interface TrainingCameraPanelProps {
  onSelectCamera?: (cam: TrainingCamera) => void
  selectedId?: string
  onStreamCountChange?: (count: number) => void
}

export function TrainingCameraPanel({ onSelectCamera, selectedId, onStreamCountChange }: TrainingCameraPanelProps) {
  const defaultIds = [...DEFAULT_COURSE_CAMERA_IDS]
  const [selectedIds, setSelectedIds] = useState<string[]>(
    selectedId ? [selectedId] : defaultIds,
  )
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [filterTab, setFilterTab] = useState<CameraFilterTab>('Tất cả')
  const [focusedCam, setFocusedCam] = useState<TrainingCamera | null>(null)
  const { isDesktop } = useShellLayout()
  /** Mobile (portrait + landscape): stacked streams + thumb grid — same selection UX */
  const stackedMobile = !isDesktop
  const stackedPortrait = stackedMobile

  useEffect(() => {
    if (!selectedId) return
    setSelectedIds(prev => (prev.includes(selectedId) ? prev : [...prev, selectedId]))
  }, [selectedId])

  const filtered = filterCameras(filterTab)
  const sidebarGroups = groupCamerasForSidebar(filtered, filterTab)

  const displayedCams = selectedIds
    .map(id => MOCK_TRAINING_CAMERAS.find(c => c.id === id))
    .filter((c): c is TrainingCamera => !!c)
  const fallback = MOCK_TRAINING_CAMERAS.filter(c => isDefaultCourseCamera(c.id))
  const safeCams = displayedCams.length > 0 ? displayedCams : fallback
  const fillHeightMain = isDesktop && safeCams.length <= 2

  useEffect(() => {
    setSelectedIds(prev => (prev.length === 0 ? [...defaultIds] : prev))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (stackedMobile) setSidebarOpen(true)
  }, [stackedMobile])

  useEffect(() => {
    onStreamCountChange?.(safeCams.length)
  }, [safeCams.length, onStreamCountChange])

  const handleThumbClick = (cam: TrainingCamera) => {
    setSelectedIds(prev => {
      if (prev.includes(cam.id)) {
        if (prev.length <= 1) return prev
        const next = prev.filter(id => id !== cam.id)
        const syncCam = MOCK_TRAINING_CAMERAS.find(c => c.id === next[0])
        if (syncCam) onSelectCamera?.(syncCam)
        return next
      }
      onSelectCamera?.(cam)
      return [...prev, cam.id]
    })
  }

  return (
    <>
      <div className={cn(
        stackedMobile
          ? 'flex max-lg:flex-col max-lg:h-auto max-lg:flex-none max-lg:min-h-0'
          : 'flex flex-1 min-h-0 h-full flex-col max-lg:landscape:flex-row lg:flex-row',
      )}>
        <div className={cn(
          'p-2 min-h-0',
          stackedMobile && 'max-lg:flex-none max-lg:shrink-0',
          !stackedMobile && 'shrink-0 lg:flex-1 lg:min-w-0 lg:min-h-0 max-lg:pb-1 max-lg:landscape:flex-1 max-lg:landscape:min-h-0 max-lg:landscape:min-w-0',
        )}>
          <div className={cn(
            'w-full min-h-0',
            stackedMobile && 'max-lg:h-auto max-lg:overflow-visible',
            !stackedMobile && 'h-full max-lg:landscape:overflow-y-auto max-lg:landscape:overflow-x-hidden lg:overflow-y-auto lg:overflow-x-hidden',
          )}>
            <CameraGrid
              cams={safeCams}
              onMaximize={cam => setFocusedCam(cam)}
              stackedPortrait={stackedPortrait}
              fillHeight={fillHeightMain}
            />
          </div>
        </div>

        <div className={cn(
          'shrink-0 flex flex-col border-[#1e2433] transition-all duration-200',
          'border-t lg:border-t-0 lg:border-l',
          stackedMobile && 'max-lg:flex-none max-lg:overflow-visible',
          !stackedMobile && 'max-lg:landscape:border-t-0 max-lg:landscape:border-l max-lg:landscape:flex-none max-lg:landscape:w-[168px] max-lg:landscape:min-h-0 max-lg:landscape:h-auto max-lg:landscape:overflow-hidden',
          'lg:overflow-hidden',
          sidebarOpen
            ? 'w-full lg:w-[220px] lg:h-full lg:min-h-0'
            : 'hidden lg:flex lg:w-8 lg:h-full lg:min-h-0',
        )}>
          {sidebarOpen ? (
            <>
              <div className="px-2 py-1.5 lg:px-2.5 lg:py-2.5 border-b border-[#1e2433] shrink-0 space-y-1.5 lg:space-y-2">
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                  {CAMERA_FILTER_TABS.map(tab => (
                    <button
                      key={tab}
                      onClick={() => setFilterTab(tab)}
                      className={cn(
                        'px-1.5 lg:px-2 py-0.5 lg:py-1 text-[8px] lg:text-[9px] font-semibold rounded whitespace-nowrap transition-colors shrink-0',
                        filterTab === tab
                          ? 'bg-primary/20 text-primary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-[#1a2235]',
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[8px] lg:text-[9px] text-muted-foreground/60">
                    Đang xem <span className="text-primary font-semibold">{selectedIds.length}</span> luồng
                  </span>
                  {isDesktop && (
                    <button
                      onClick={() => setSidebarOpen(false)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-[#1a2235] transition-colors shrink-0"
                      title="Thu gọn"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className={cn(
                'px-1.5 py-1.5 lg:px-2.5 lg:py-2.5',
                stackedMobile
                  ? 'shrink-0 max-h-[min(36vh,280px)] overflow-y-auto overscroll-y-contain'
                  : 'flex-1 min-h-0 overflow-y-auto',
              )}>
                <div className="flex flex-col gap-2 lg:gap-3">
                  {sidebarGroups.map(({ key, cameras }) => (
                    <div key={key}>
                      <div className="flex items-center gap-1.5 mb-1 lg:mb-2">
                        <span className="text-[8px] lg:text-[9px] font-bold text-muted-foreground/70 uppercase tracking-widest whitespace-nowrap">
                          {key}
                        </span>
                        <div className="flex-1 h-px bg-[#1e2433]" />
                        <span className="text-[8px] lg:text-[9px] text-muted-foreground/40 shrink-0">
                          {cameras.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 max-[360px]:grid-cols-2 gap-1 lg:flex lg:flex-col lg:gap-2">
                        {cameras.map(cam => (
                          <CameraThumb
                            key={cam.id}
                            cam={cam}
                            selected={selectedIds.includes(cam.id)}
                            onClick={() => handleThumbClick(cam)}
                            compact={!isDesktop}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[2.5rem]">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-[#1a2235] transition-colors"
                title="Mở rộng"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <FullscreenOverlay cam={focusedCam} onClose={() => setFocusedCam(null)} />
    </>
  )
}

export type { TrainingCamera }
