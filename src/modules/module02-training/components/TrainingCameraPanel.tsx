import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useShellLayout } from '@/hooks/useShellLayout'
import { useActiveTenant } from '@/hooks/useTenantTrainingScope'
import { CameraVideoFeed } from './CameraVideoFeed'
import { CameraJsmpegFeed } from '@/modules/dao-tao-tuan-thu/components/CameraJsmpegFeed'
import { CameraChrome, CameraLiveBadge, CameraOfflineBadge } from './CameraToolbar'
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
  if (cam.wsUrl) {
    return (
      <CameraJsmpegFeed wsUrl={cam.wsUrl} cameraId={cam.id} />
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
  /** Mobile bodycam — luôn thử getUserMedia, không khóa bởi stream_online backend. */
  const isOffline = cam.status === 'offline' && cam.streamType !== 'mobile'

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
      {!isOffline && <CameraLiveFeed cam={cam} playing={false} compact aiOverlay={false} />}
      {isOffline && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[8px] font-bold tracking-widest text-muted-foreground/50 uppercase">Offline</span>
        </div>
      )}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={CCTV_SCANLINE} />

      <span className="absolute top-0.5 left-0.5 z-[1]">
        {isOffline
          ? <CameraOfflineBadge compact={compact} />
          : ((cam.streamType !== 'mobile' || selected) && <CameraLiveBadge compact={compact} />)}
      </span>

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

function CameraCell({ cam, compact, onMaximize, isMaximized, analyzeThrottle, streamIndex, playing = true }: {
  cam: TrainingCamera
  compact?: boolean
  onMaximize: () => void
  isMaximized?: boolean
  analyzeThrottle?: boolean
  streamIndex?: number
  /** false khi mobile đang mở fullscreen — tránh 2 getUserMedia (iPhone tile đen) */
  playing?: boolean
}) {
  /** Mobile bodycam — luôn mount feed; offline chỉ áp dụng luồng remote (HLS/WS). */
  const isOffline = cam.status === 'offline' && cam.streamType !== 'mobile'

  return (
    <div className="relative w-full h-full overflow-hidden rounded-lg bg-black border border-[#1e2433]">
      <div className="absolute inset-0 bg-black" />
      {isOffline ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground/50 z-[5]">
          <span className="text-xs font-bold tracking-[0.2em] uppercase">Offline</span>
          <span className="text-[10px] text-muted-foreground/40">{cameraDisplayLabel(cam)}</span>
        </div>
      ) : (
        <CameraLiveFeed
          cam={cam}
          playing={playing}
          compact={compact}
          aiOverlay={playing}
          analyzeThrottle={analyzeThrottle}
          streamIndex={streamIndex}
        />
      )}
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

function CameraGrid({ cams, onMaximize, onCloseMaximize, stackedPortrait, fillHeight, forceSingleCol, focusedCamId, compactVideo, compactVideoMaxClass }: {
  cams: TrainingCamera[]
  onMaximize: (cam: TrainingCamera) => void
  onCloseMaximize: () => void
  stackedPortrait: boolean
  fillHeight: boolean
  forceSingleCol?: boolean
  /** Module 05 — giới hạn chiều cao ô, letterbox đen (aspect-video). */
  compactVideo?: boolean
  /** Override max-height class khi compactVideo — Module 05 patrol layout cao hơn. */
  compactVideoMaxClass?: string
  /** Camera đang phóng to — giữ nguyên instance feed, không mount stream mới. */
  focusedCamId?: string | null
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
      {cams.map((cam, index) => {
        const isFocused = focusedCamId === cam.id
        const isBackground = Boolean(focusedCamId && focusedCamId !== cam.id)
        const cellShellClass = cn(
          'relative w-full min-w-0 shrink-0 bg-black',
          fillHeight
            ? 'h-full min-h-[120px]'
            : cn(
              'aspect-video',
              compactVideo
                ? (compactVideoMaxClass ?? 'max-h-[min(20dvh,160px)] sm:max-h-[min(24dvh,180px)] max-lg:landscape:max-h-[min(18dvh,140px)] lg:max-h-[min(28vh,220px)]')
                : 'max-h-[min(36dvh,280px)]',
            ),
        )
        return (
          <div key={cam.id} className="relative min-w-0">
            {isFocused && (
              <div className={cn(cellShellClass, 'invisible pointer-events-none')} aria-hidden />
            )}
            <div
              className={cn(
                cellShellClass,
                isFocused && [
                  'fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4',
                  '!h-auto !max-h-none !w-full',
                ],
                isBackground && 'invisible pointer-events-none',
              )}
            >
              <div
                className={cn(
                  'relative w-full h-full min-h-0',
                  isFocused && 'max-w-[96vw] max-h-[92dvh] rounded-xl overflow-hidden border border-[#2a3855] shadow-2xl',
                )}
                onClick={isFocused ? e => e.stopPropagation() : undefined}
              >
                <CameraCell
                  cam={cam}
                  compact={compact}
                  analyzeThrottle={analyzeThrottle}
                  streamIndex={index}
                  playing={!isBackground}
                  isMaximized={isFocused}
                  onMaximize={isFocused ? onCloseMaximize : () => onMaximize(cam)}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MaximizeBackdrop({ active, onClose }: { active: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [active, onClose])

  if (!active) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[110] bg-black/92 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
      aria-hidden
    />,
    document.body,
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
  /** Mặc định thu gọn danh sách camera bên phải */
  defaultSidebarOpen?: boolean
  /** Mobile/Module 05: aspect-video + letterbox — không fill hết chiều cao panel. */
  mobileCompactVideo?: boolean
  /** Override max-h ô video khi mobileCompactVideo — dùng cho Module 05 patrol. */
  compactVideoMaxClass?: string
  /** Module 05 mobile: stack 16:9, không scroll lồng trong grid video. */
  mobileStackedNoScroll?: boolean
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
  defaultSidebarOpen = true,
  mobileCompactVideo = false,
  compactVideoMaxClass,
  mobileStackedNoScroll = false,
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
  const [sidebarOpen, setSidebarOpen] = useState(defaultSidebarOpen)
  const [filterTab, setFilterTab] = useState<string>(() => tabs[0] ?? 'Tất cả')

  useEffect(() => {
    if (!tabs.includes(filterTab)) {
      setFilterTab(tabs[0] ?? 'Tất cả')
    }
  }, [tabs, filterTab])
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
  /** Compact: luôn aspect-video + object-contain trong ô đen — không stretch panel. */
  const fillHeightMain = !mobileCompactVideo || mobileStackedNoScroll
  const portraitMaxRows = mobileCompactVideo && !isDesktop && !mobileStackedNoScroll
    ? 1
    : MOBILE_PORTRAIT_MAX_VISIBLE_ROWS

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
    if (!scrollNode || isDesktop || fillHeightMain || mobileStackedNoScroll) {
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
        : portraitMaxRows
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
  }, [isDesktop, gridCols, gridRows, safeCams.length, selectedIds.join(','), sidebarOpen, portraitMaxRows, mobileCompactVideo])

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
        mobileCompactVideo ? 'h-auto max-h-full' : 'h-full',
        'flex flex-col lg:flex-row',
        mobileCompactVideo ? 'lg:h-auto lg:max-h-full' : 'lg:flex-1 lg:min-h-0',
        'max-lg:landscape:grid max-lg:landscape:grid-cols-[minmax(0,1fr)_168px]',
        'max-lg:landscape:items-stretch max-lg:landscape:min-h-0',
      )}>
        <div className="flex flex-1 min-h-0 min-w-0 p-2 max-lg:pb-1 lg:min-h-0 max-lg:landscape:min-w-0">
          <div
            ref={videoGridRef}
            className={cn(
              'w-full min-h-0 flex-1',
              fillHeightMain
                ? 'overflow-hidden'
                : 'overflow-y-auto overflow-x-hidden overscroll-y-contain',
            )}
            style={mobileViewportH ? { maxHeight: mobileViewportH } : undefined}
          >
            <CameraGrid
              cams={safeCams}
              onMaximize={cam => setFocusedCam(cam)}
              onCloseMaximize={() => setFocusedCam(null)}
              stackedPortrait={stackedPortrait}
              fillHeight={fillHeightMain}
              forceSingleCol={mobileStackedNoScroll && !isDesktop}
              compactVideo={mobileCompactVideo && !mobileStackedNoScroll}
              compactVideoMaxClass={compactVideoMaxClass}
              focusedCamId={focusedCam?.id}
            />
          </div>
        </div>

        <div
          className={cn(
            'shrink-0 flex flex-col border-[#1e2433] transition-all duration-200 min-h-0',
            'border-t lg:border-t-0 lg:border-l',
            'max-lg:landscape:border-t-0 max-lg:landscape:border-l max-lg:landscape:w-[168px] max-lg:landscape:min-h-0',
            'lg:overflow-hidden',
            mobileCompactVideo && !sidebarOpen && 'max-lg:[@media(orientation:portrait)]:hidden',
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
                  ? 'shrink-0 max-h-[min(24dvh,168px)] overflow-y-auto overscroll-y-contain'
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

      <MaximizeBackdrop active={Boolean(focusedCam)} onClose={() => setFocusedCam(null)} />
    </>
  )
}

export type { TrainingCamera }
