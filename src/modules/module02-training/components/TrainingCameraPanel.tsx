import { useState, useEffect, useMemo, useRef } from 'react'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useShellLayout } from '@/hooks/useShellLayout'
import { useActiveTenant } from '@/hooks/useTenantTrainingScope'
import { CameraVideoFeed } from './CameraVideoFeed'
import { CameraChrome, CameraLiveBadge } from './CameraToolbar'
import { MobileCameraFeed } from './MobileCameraFeed'
import { preloadFaceDetection } from '../services/faceDetection.service'
import {
  CAMERA_FILTER_TABS,
  DEFAULT_COURSE_CAMERA_IDS,
  MOCK_TRAINING_CAMERAS,
  cameraDisplayLabel,
  cameraMetaLabel,
  filterCameras,
  groupCamerasForSidebar,
  isDefaultCourseCamera,
  type CameraFilterTab,
  type TrainingCamera,
} from '../data/trainingCameras'

const CCTV_SCANLINE = {
  backgroundImage:
    'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 4px)',
} as const

function CameraLiveFeed({ cam, playing = true, compact, aiOverlay = false, analyzeThrottle, streamIndex }: {
  cam: TrainingCamera; playing?: boolean; compact?: boolean; aiOverlay?: boolean; analyzeThrottle?: boolean; streamIndex?: number
}) {
  if (cam.streamType === 'mobile') {
    return (
      <MobileCameraFeed
        cameraId={cam.id}
        label={cam.assignee ?? cam.name}
        playing={playing}
        autoStartCapture={playing}
        compact={compact}
        aiEnabled={aiOverlay}
      />
    )
  }
  if (!cam.streamUrl) return null
  return (
    <CameraVideoFeed
      src={cam.streamUrl}
      cameraId={cam.id}
      streamType={cam.streamType}
      playing={playing}
      aiOverlay={aiOverlay}
      compact={compact}
      analyzeThrottle={analyzeThrottle}
      streamIndex={streamIndex}
    />
  )
}

function CameraThumb({ cam, selected, onClick, compact = false, strip = false }: {
  cam: TrainingCamera; selected: boolean; onClick: () => void; compact?: boolean; strip?: boolean
}) {
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
      <CameraLiveFeed cam={cam} playing={false} compact aiOverlay={false} />
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={CCTV_SCANLINE} />

      {(cam.streamType !== 'mobile' || selected) && (
        <span className="absolute top-0.5 left-0.5 z-[1]">
          <CameraLiveBadge compact={compact} />
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
        {cameraMetaLabel(cam) && cam.streamType !== 'mobile' && (
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

function CameraCell({ cam, compact, onMaximize, isMaximized, analyzeThrottle, streamIndex }: {
  cam: TrainingCamera; compact?: boolean; onMaximize: () => void; isMaximized?: boolean; analyzeThrottle?: boolean; streamIndex?: number
}) {
  return (
    <div className="relative w-full h-full overflow-hidden rounded-lg bg-[#060b14] border border-[#1e2433]">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f1922] via-[#0a1219] to-[#060d14]" />
      <CameraLiveFeed cam={cam} compact={compact} aiOverlay analyzeThrottle={analyzeThrottle} streamIndex={streamIndex} />
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={CCTV_SCANLINE} />
      <CameraChrome
        cam={cam}
        compact={compact}
        onMaximize={onMaximize}
        isMaximized={isMaximized}
      />
    </div>
  )
}

function getGridCols(count: number, stackedPortrait: boolean, forceSingleCol = false): number {
  if (forceSingleCol || count === 1) return 1
  if (stackedPortrait && count <= 4) return 1
  if (stackedPortrait && count > 6) return 2
  if (count <= 4) return 2
  if (count <= 9) return 3
  return 4
}

const MOBILE_PORTRAIT_MAX_VISIBLE_ROWS = 4
const MOBILE_LANDSCAPE_MAX_VISIBLE_ROWS = 3
const GRID_GAP_PX = 6
const MOBILE_VIDEO_COL_PAD_Y = 12

function getMobileVideoViewportHeight(
  containerWidth: number,
  cols: number,
  rowCount: number,
  maxVisibleRows: number,
): number | null {
  if (containerWidth <= 0 || rowCount <= 0) return null
  const gap = GRID_GAP_PX
  const cellWidth = (containerWidth - gap * (cols - 1)) / cols
  const rowHeight = cellWidth * (9 / 16)
  const visibleRows = Math.min(rowCount, maxVisibleRows)
  return Math.ceil(visibleRows * rowHeight + (visibleRows - 1) * gap)
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
  const rows = Math.ceil(count / cols)
  const compact = count > 2
  const analyzeThrottle = count >= 2

  return (
    <div
      className={cn(
        'grid gap-1.5 w-full',
        fillHeight ? 'h-full min-h-0' : 'h-auto content-start',
      )}
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        ...(fillHeight ? { gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` } : {}),
      }}
    >
      {cams.map((cam, index) => (
        <div
          key={cam.id}
          className={cn(
            'relative w-full min-w-0 shrink-0',
            fillHeight ? 'h-full min-h-[120px]' : 'aspect-video max-h-[min(72vh,720px)]',
          )}
        >
          <CameraCell cam={cam} compact={compact} analyzeThrottle={analyzeThrottle} streamIndex={index} onMaximize={() => onMaximize(cam)} />
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
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', h)
      document.body.style.overflow = ''
    }
  }, [cam, onClose])

  if (!cam) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center backdrop-blur-sm p-3"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative w-full h-full max-w-[96vw] max-h-[92vh] rounded-xl overflow-hidden border border-[#2a3855] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <CameraCell cam={cam} onMaximize={onClose} isMaximized />
      </div>
    </div>
  )
}

interface TrainingCameraPanelProps {
  onSelectCamera?: (cam: TrainingCamera) => void
  selectedId?: string
  onStreamCountChange?: (count: number) => void
  /** Catalog camera tùy module — mặc định Module 02 OCP1 */
  cameras?: TrainingCamera[]
  /** Luồng mặc định khi mở panel — Module 03 truyền DEFAULT_SAFETY_CAMERA_IDS */
  defaultCameraIds?: readonly string[]
  filterTabs?: string[]
  filterFn?: (tab: string) => TrainingCamera[]
  groupFn?: (cameras: TrainingCamera[], tab: string) => { key: string; cameras: TrainingCamera[] }[]
}

export function TrainingCameraPanel({
  onSelectCamera,
  selectedId,
  onStreamCountChange,
  cameras,
  defaultCameraIds,
  filterTabs,
  filterFn,
  groupFn,
}: TrainingCameraPanelProps) {
  const catalog = cameras ?? MOCK_TRAINING_CAMERAS
  const tabs = filterTabs ?? CAMERA_FILTER_TABS
  const resolveFilter = filterFn
    ?? ((tab: string) => filterCameras(tab as CameraFilterTab))
  const resolveGroup = groupFn
    ?? ((list: TrainingCamera[], tab: string) => groupCamerasForSidebar(list, tab as CameraFilterTab))

  const defaultIds = [...(defaultCameraIds ?? DEFAULT_COURSE_CAMERA_IDS)]
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const base = defaultIds.length > 0 ? [...defaultIds] : []
    if (selectedId && !base.includes(selectedId)) {
      return [selectedId, ...base]
    }
    return base.length > 0 ? base : (selectedId ? [selectedId] : [])
  })
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [filterTab, setFilterTab] = useState<string>('Tất cả')
  const [focusedCam, setFocusedCam] = useState<TrainingCamera | null>(null)
  const videoGridRef = useRef<HTMLDivElement>(null)
  const [landscapeSidebarH, setLandscapeSidebarH] = useState<number | null>(null)
  const [mobileViewportH, setMobileViewportH] = useState<number | null>(null)
  const { isDesktop } = useShellLayout()
  const { hasDemoData } = useActiveTenant()

  useEffect(() => {
    preloadFaceDetection()
  }, [])
  /** Mobile (portrait + landscape): stacked streams + thumb grid — same selection UX */
  const stackedMobile = !isDesktop
  const stackedPortrait = stackedMobile

  useEffect(() => {
    if (!selectedId) return
    setSelectedIds(prev => (prev.includes(selectedId) ? prev : [...prev, selectedId]))
  }, [selectedId])

  const filtered = resolveFilter(filterTab)
  const sidebarGroups = resolveGroup(filtered, filterTab)

  const displayedCams = selectedIds
    .map(id => catalog.find(c => c.id === id))
    .filter((c): c is TrainingCamera => !!c)
  const fallback = defaultCameraIds
    ? catalog.filter(c => (defaultCameraIds as readonly string[]).includes(c.id))
    : catalog.filter(c => isDefaultCourseCamera(c.id))
  const safeCams = displayedCams.length > 0 ? displayedCams : fallback
  /** Luôn giữ aspect-video — tránh kéo giãn ROI/camera trên web & tablet. */
  const fillHeightMain = false

  const gridCols = useMemo(
    () => getGridCols(safeCams.length, stackedPortrait),
    [safeCams.length, stackedPortrait],
  )
  const gridRows = useMemo(
    () => Math.ceil(safeCams.length / gridCols),
    [safeCams.length, gridCols],
  )

  useEffect(() => {
    const scrollNode = videoGridRef.current
    if (!scrollNode || isDesktop) {
      setMobileViewportH(null)
      setLandscapeSidebarH(null)
      return
    }

    const mobileMq = window.matchMedia('(max-width: 1023px)')
    const landscapeMq = window.matchMedia('(max-width: 1023px) and (orientation: landscape)')

    const sync = () => {
      if (!mobileMq.matches) {
        setMobileViewportH(null)
        setLandscapeSidebarH(null)
        return
      }

      const maxRows = landscapeMq.matches
        ? MOBILE_LANDSCAPE_MAX_VISIBLE_ROWS
        : MOBILE_PORTRAIT_MAX_VISIBLE_ROWS
      const viewportH = getMobileVideoViewportHeight(scrollNode.clientWidth, gridCols, gridRows, maxRows)
      setMobileViewportH(viewportH)

      if (landscapeMq.matches && sidebarOpen && viewportH) {
        setLandscapeSidebarH(viewportH + MOBILE_VIDEO_COL_PAD_Y)
      } else {
        setLandscapeSidebarH(null)
      }
    }

    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(scrollNode)
    mobileMq.addEventListener('change', sync)
    landscapeMq.addEventListener('change', sync)
    return () => {
      observer.disconnect()
      mobileMq.removeEventListener('change', sync)
      landscapeMq.removeEventListener('change', sync)
    }
  }, [isDesktop, gridCols, gridRows, safeCams.length, selectedIds.join(','), sidebarOpen])

  useEffect(() => {
    setSelectedIds(prev => (prev.length === 0 ? [...defaultIds] : prev))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onStreamCountChange?.(safeCams.length)
  }, [safeCams.length, onStreamCountChange])

  const handleThumbClick = (cam: TrainingCamera) => {
    setSelectedIds(prev => {
      if (prev.includes(cam.id)) {
        if (prev.length <= 1) return prev
        const next = prev.filter(id => id !== cam.id)
        const syncCam = catalog.find(c => c.id === next[0])
        if (syncCam) onSelectCamera?.(syncCam)
        return next
      }
      onSelectCamera?.(cam)
      return [...prev, cam.id]
    })
  }

  /* Catalog tùy module (vd. Module 03 SAFETY_CAMERAS) luôn hiện — không phụ thuộc tenant demo */
  if (!hasDemoData && cameras === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[200px] p-6 text-center text-[11px] text-muted-foreground">
        Chưa có dữ liệu camera cho công trường này
      </div>
    )
  }

  return (
    <>
      <div className={cn(
        'w-full min-h-0',
        'flex flex-col lg:flex-row lg:flex-1 lg:min-h-0 lg:h-full',
        'max-lg:h-auto max-lg:flex-none',
        'max-lg:landscape:grid max-lg:landscape:grid-cols-[minmax(0,1fr)_168px]',
        'max-lg:landscape:items-start',
      )}>
        <div className="flex min-h-0 min-w-0 p-2 max-lg:pb-1 lg:flex-1 lg:min-h-0 max-lg:landscape:min-w-0 max-lg:landscape:h-auto max-lg:landscape:self-start">
          <div
            ref={videoGridRef}
            className="w-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain"
            style={mobileViewportH ? { maxHeight: mobileViewportH } : undefined}
          >
            <CameraGrid
              cams={safeCams}
              onMaximize={cam => setFocusedCam(cam)}
              stackedPortrait={stackedPortrait}
              fillHeight={fillHeightMain}
            />
          </div>
        </div>

        <div
          className={cn(
            'shrink-0 flex flex-col border-[#1e2433] transition-all duration-200 min-h-0',
            'border-t lg:border-t-0 lg:border-l',
            'max-lg:landscape:border-t-0 max-lg:landscape:border-l max-lg:landscape:w-[168px] max-lg:landscape:min-h-0',
            'lg:overflow-hidden',
            sidebarOpen
              ? 'w-full lg:w-[220px] lg:h-full lg:min-h-0'
              : 'w-full shrink-0 lg:flex lg:w-8 lg:h-full lg:min-h-0',
          )}
          style={landscapeSidebarH ? { maxHeight: landscapeSidebarH } : undefined}
        >
          {sidebarOpen ? (
            <>
              <div className="flex items-center gap-1.5 px-2 py-1.5 lg:px-2.5 lg:py-2 border-b border-[#1e2433] shrink-0">
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0 flex-1">
                  {tabs.map(tab => (
                    <button
                      key={tab}
                      type="button"
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
                <span className="text-[8px] lg:text-[9px] text-muted-foreground/60 whitespace-nowrap shrink-0 tabular-nums">
                  <span className="text-primary font-semibold">{selectedIds.length}</span> luồng
                </span>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-[#1a2235] transition-colors shrink-0"
                  title="Thu gọn danh sách camera"
                  aria-expanded={sidebarOpen}
                  aria-label="Thu gọn danh sách camera"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
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
            <div className="flex items-center gap-1.5 px-2 py-1.5 w-full lg:flex-col lg:items-center lg:justify-center lg:h-full lg:min-h-[2.5rem] lg:px-0 lg:gap-0">
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0 flex-1 lg:hidden">
                {tabs.map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilterTab(tab)}
                    className={cn(
                      'px-1.5 py-0.5 text-[8px] font-semibold rounded whitespace-nowrap transition-colors shrink-0',
                      filterTab === tab
                        ? 'bg-primary/20 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-[#1a2235]',
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <span className="text-[8px] text-muted-foreground/60 whitespace-nowrap shrink-0 tabular-nums lg:hidden">
                <span className="text-primary font-semibold">{selectedIds.length}</span> luồng
              </span>
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-[#1a2235] transition-colors shrink-0 lg:p-1.5"
                title="Mở danh sách camera"
                aria-expanded={sidebarOpen}
                aria-label="Mở danh sách camera"
              >
                <ChevronLeft className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
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
