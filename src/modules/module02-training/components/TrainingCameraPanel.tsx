import { useState, useEffect, useMemo, useRef } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useShellLayout } from '@/hooks/useShellLayout'
import { useActiveTenant } from '@/hooks/useTenantTrainingScope'
import { CameraVideoFeed } from './CameraVideoFeed'
import { useHelmetLocalStream } from '@/hooks/useHelmetLocalStream'
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
  const localStream = useHelmetLocalStream(cam.id)

  /**
   * Mũ và CMS cùng một máy: dùng thẳng camera đang phát, không vòng qua server.
   * Phải đi qua MobileCameraFeed — chỉ thành phần này chạy vòng phân tích AI trên
   * khung hình tại chỗ. CameraVideoFeed chỉ đọc detection do backend trả về, nên
   * tile sẽ có hình mà không bao giờ có ROI khi luồng chưa lên tới server.
   */
  if (localStream) {
    return (
      <MobileCameraFeed
        cameraId={cam.id}
        label={cam.assignee ?? cam.name}
        playing={playing}
        externalStream={localStream}
        compact={compact}
        aiEnabled={aiOverlay}
      />
    )
  }

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

  // MediaMTX WHEP/HLS — pipeline thống nhất HC-* / DR-*; ưu tiên trước JSMpeg legacy.
  if (cam.whepUrl || cam.streamUrl) {
    return (
      <CameraVideoFeed
        src={cam.streamUrl ?? ''}
        whepUrl={cam.whepUrl}
        hlsFallbackSrc={cam.streamFallbackUrl}
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

  if (cam.wsUrl) {
    return (
      <CameraJsmpegFeed wsUrl={cam.wsUrl} cameraId={cam.id} />
    )
  }

  return null
}

function CameraThumb({ cam, selected, onClick, compact = false, strip = false, mini = false }: {
  cam: TrainingCamera; selected: boolean; onClick: () => void; compact?: boolean; strip?: boolean; mini?: boolean
}) {
  /** Mobile bodycam — luôn thử getUserMedia, không khóa bởi stream_online backend. */
  const isOffline = cam.status === 'offline' && !cam.framesLive && cam.streamType !== 'mobile'

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
          ? <CameraOfflineBadge compact={compact || mini} />
          : ((cam.streamType !== 'mobile' || selected) && <CameraLiveBadge compact={compact || mini} />)}
      </span>

      <div className={cn(
        'absolute top-0.5 right-0.5 rounded-sm border-2 flex items-center justify-center transition-all',
        mini ? 'w-2 h-2' : compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5',
        selected
          ? 'bg-primary border-primary'
          : 'border-white/30 bg-black/30 opacity-0 group-hover:opacity-100',
      )}>
        {selected && <Check className={cn('text-white', mini ? 'w-1 h-1' : compact ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5')} strokeWidth={3} />}
      </div>

      <div className={cn(
        'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/75 to-transparent',
        mini ? 'px-0.5 pb-0.5 pt-1.5' : compact ? 'px-1 pb-1 pt-2' : 'px-1.5 pb-1.5 pt-4',
      )}>
        <p className={cn(
          'text-white/90 font-semibold truncate leading-snug',
          mini ? 'text-[6px]' : compact ? 'text-[6.5px]' : 'text-[9px]',
        )}>
          {cameraDisplayLabel(cam)}
        </p>
        {cameraMetaLabel(cam) && cam.streamType !== 'mobile' && (
          <p className={cn(
            'text-blue-300/80 truncate leading-tight',
            mini ? 'text-[5px]' : compact ? 'text-[5.5px]' : 'text-[7.5px]',
          )}>
            {cameraMetaLabel(cam)}
          </p>
        )}
      </div>
    </div>
  )
}

function CameraCell({ cam, compact, analyzeThrottle, streamIndex, playing = true, streamWhenOffline = false }: {
  cam: TrainingCamera
  compact?: boolean
  analyzeThrottle?: boolean
  streamIndex?: number
  playing?: boolean
  streamWhenOffline?: boolean
}) {
  /** Mobile bodycam — luôn mount feed; offline chỉ áp dụng luồng remote (HLS/WS). */
  const isOffline = cam.status === 'offline' && !cam.framesLive && cam.streamType !== 'mobile'
  /**
   * Badge thường trễ hơn nguồn vài giây nên tile vẫn thử tải khi báo offline.
   * Nhưng khi backend đã khẳng định không có tín hiệu thì thôi: mũ tắt cả buổi
   * mà cứ gọi tiếp là hàng nghìn lỗi 404 đỏ console và request rác.
   * Metrics poll 2.2s sẽ bật lại tile trong vài giây khi nguồn lên sóng.
   */
  const tryStreamDespiteOffline = Boolean(
    streamWhenOffline
      && !cam.streamOfflineConfirmed
      && (cam.streamType === 'bodycam' || cam.streamType === 'flycam')
      && cam.streamUrl,
  )
  const blockFeed = isOffline && !tryStreamDespiteOffline

  return (
    <div className="relative w-full h-full overflow-hidden rounded-lg bg-black border border-[#1e2433]">
      <div className="absolute inset-0 bg-black" />
      {blockFeed ? (
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

function getGridRowHeight(containerWidth: number, cols: number): number | null {
  if (containerWidth <= 0 || cols <= 0) return null
  const gap = GRID_GAP_PX
  const cellWidth = (containerWidth - gap * (cols - 1)) / cols
  return Math.ceil(cellWidth * (9 / 16))
}

function getMobileVideoViewportHeight(
  containerWidth: number,
  cols: number,
  rowCount: number,
  maxVisibleRows: number,
): number | null {
  if (containerWidth <= 0 || rowCount <= 0) return null
  const rowHeight = getGridRowHeight(containerWidth, cols)
  if (rowHeight == null) return null
  const gap = GRID_GAP_PX
  const visibleRows = Math.min(rowCount, maxVisibleRows)
  return Math.ceil(visibleRows * rowHeight + (visibleRows - 1) * gap)
}

function CameraGrid({ cams, stackedPortrait, fillHeight, forceSingleCol, compactVideo, compactVideoMaxClass, aspectVideoGrid, fixedRowHeightPx, streamWhenOffline }: {
  cams: TrainingCamera[]
  stackedPortrait: boolean
  fillHeight: boolean
  forceSingleCol?: boolean
  /** Module 05 — giới hạn chiều cao ô, letterbox đen (aspect-video). */
  compactVideo?: boolean
  /** Override max-height class khi compactVideo — Module 05 patrol layout cao hơn. */
  compactVideoMaxClass?: string
  /** Patrol grid: luôn 16:9, không giới hạn max-h trên desktop. */
  aspectVideoGrid?: boolean
  /** Patrol tier scroll: chiều cao hàng grid cố định (px) — tránh hàng 2 đè hàng 1. */
  fixedRowHeightPx?: number | null
  streamWhenOffline?: boolean
}) {
  const count = cams.length
  const cols = getGridCols(count, stackedPortrait, forceSingleCol)
  const rows = Math.ceil(count / cols)
  const compact = count > 2
  const analyzeThrottle = count >= 2
  const useFixedRows = fixedRowHeightPx != null && fixedRowHeightPx > 0

  return (
    <div
      className={cn(
        'grid gap-1.5 w-full',
        fillHeight ? 'h-full min-h-0' : 'h-auto content-start',
        useFixedRows && 'auto-rows-[minmax(0,auto)]',
      )}
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        ...(fillHeight ? { gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` } : {}),
        ...(useFixedRows ? { gridAutoRows: `${fixedRowHeightPx}px` } : {}),
      }}
    >
      {cams.map((cam, index) => {
        const cellShellClass = cn(
          'relative w-full min-w-0 bg-black overflow-hidden',
          fillHeight
            ? 'h-full min-h-[120px]'
            : useFixedRows
              ? 'h-full min-h-0'
              : cn(
                'aspect-video shrink-0',
                compactVideo
                  ? (compactVideoMaxClass ?? 'max-h-[min(20dvh,160px)] sm:max-h-[min(24dvh,180px)] max-lg:landscape:max-h-[min(18dvh,140px)] lg:max-h-[min(28vh,220px)]')
                  : aspectVideoGrid
                    ? undefined
                    : 'max-h-[min(36dvh,280px)]',
              ),
        )
        return (
          <div key={cam.id} className={cn('relative min-w-0 min-h-0', useFixedRows && 'h-full')}>
            <div className={cellShellClass}>
              <CameraCell
                cam={cam}
                compact={compact}
                analyzeThrottle={analyzeThrottle}
                streamIndex={index}
                playing
                streamWhenOffline={streamWhenOffline}
              />
            </div>
          </div>
        )
      })}
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
  /** Mặc định thu gọn danh sách camera bên phải */
  defaultSidebarOpen?: boolean
  /** Mobile/Module 05: aspect-video + letterbox — không fill hết chiều cao panel. */
  mobileCompactVideo?: boolean
  /** Override max-h ô video khi mobileCompactVideo — dùng cho Module 05 patrol. */
  compactVideoMaxClass?: string
  /** Module 05 mobile: stack 16:9, không scroll lồng trong grid video. */
  mobileStackedNoScroll?: boolean
  /** Module 05 patrol: ô camera luôn 16:9 — không kéo giãn theo chiều cao panel. */
  aspectVideoGrid?: boolean
  /** iPad ngang — ép cap chiều cao video dù width ≥1024 (desktop). */
  preferCompactVideo?: boolean
  /** Patrol desktop/iPad: giới hạn số hàng grid + scroll bên trong Tier 2. */
  desktopMaxVisibleRows?: number
  /** Chiều rộng sidebar — class Tailwind đầy đủ (patrol: hẹp hơn mặc định). */
  sidebarOpenClass?: string
  sidebarCompactClass?: string
  /** Pixel width sidebar compact (iPad ngang / landscape) — dùng cho grid 2 cột. */
  sidebarCompactPx?: number
  /** Chiều rộng sidebar khi thu gọn (px) — patrol mặc định hẹp hơn lg:w-8. */
  sidebarCollapsedPx?: number
  /** Class Tailwind sidebar thu gọn — desktop. */
  sidebarCollapsedClass?: string
  /** Patrol sidebar: thumb nhỏ gọn + full width cột. */
  sidebarThumbCompact?: boolean
  sidebarThumbFullWidth?: boolean
  /** Patrol bodycam/flycam: vẫn thử load HLS khi badge offline (metrics trễ hơn nguồn). */
  streamWhenOffline?: boolean
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
  aspectVideoGrid = false,
  preferCompactVideo = false,
  streamWhenOffline = false,
  desktopMaxVisibleRows,
  sidebarOpenClass = 'lg:w-[220px]',
  sidebarCompactClass = 'max-lg:landscape:w-[168px]',
  sidebarCompactPx,
  sidebarCollapsedPx,
  sidebarCollapsedClass = 'lg:w-8',
  sidebarThumbCompact = false,
  sidebarThumbFullWidth = false,
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
  const videoGridRef = useRef<HTMLDivElement>(null)
  const [landscapeSidebarH, setLandscapeSidebarH] = useState<number | null>(null)
  const [mobileViewportH, setMobileViewportH] = useState<number | null>(null)
  const [gridRowHeightPx, setGridRowHeightPx] = useState<number | null>(null)
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
  const fillHeightMain = !aspectVideoGrid && (!mobileCompactVideo || mobileStackedNoScroll)
  const useCompactVideoCaps = preferCompactVideo
    || ((mobileCompactVideo && !mobileStackedNoScroll)
      || (aspectVideoGrid && !isDesktop && !mobileStackedNoScroll))
  const aspectGridInTier = aspectVideoGrid && isDesktop && !preferCompactVideo && !desktopMaxVisibleRows
  /** Desktop / iPad patrol: giới hạn hàng + scroll trong Tier 2. */
  const patrolTierScroll = Boolean(
    aspectVideoGrid && desktopMaxVisibleRows != null && !mobileStackedNoScroll,
  )
  /** Mobile compact: fill tier height — video scrolls inside, sidebar strip stays visible. */
  const mobileFillPanel = mobileCompactVideo && !isDesktop && !mobileStackedNoScroll
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
    if (!scrollNode || mobileStackedNoScroll) {
      setMobileViewportH(null)
      setLandscapeSidebarH(null)
      setGridRowHeightPx(null)
      return
    }

    if (isDesktop && !preferCompactVideo && !patrolTierScroll && fillHeightMain) {
      setMobileViewportH(null)
      setLandscapeSidebarH(null)
      setGridRowHeightPx(null)
      return
    }

    const mobileMq = window.matchMedia('(max-width: 1023px)')
    const landscapeMq = window.matchMedia('(max-width: 1023px) and (orientation: landscape)')

    const sync = () => {
      const rowH = getGridRowHeight(scrollNode.clientWidth, gridCols)

      if (patrolTierScroll) {
        const viewportH = getMobileVideoViewportHeight(
          scrollNode.clientWidth,
          gridCols,
          gridRows,
          desktopMaxVisibleRows ?? 1,
        )
        setMobileViewportH(viewportH)
        setGridRowHeightPx(rowH)
        if (sidebarOpen && viewportH) {
          setLandscapeSidebarH(viewportH + MOBILE_VIDEO_COL_PAD_Y)
        } else {
          setLandscapeSidebarH(null)
        }
        return
      }

      if (!mobileMq.matches && !preferCompactVideo) {
        setMobileViewportH(null)
        setLandscapeSidebarH(null)
        setGridRowHeightPx(null)
        return
      }

      const landscapeCompact = preferCompactVideo || landscapeMq.matches
      const maxRows = landscapeCompact
        ? MOBILE_LANDSCAPE_MAX_VISIBLE_ROWS
        : portraitMaxRows
      const viewportH = getMobileVideoViewportHeight(scrollNode.clientWidth, gridCols, gridRows, maxRows)
      setMobileViewportH(viewportH)
      setGridRowHeightPx(rowH)

      if (landscapeCompact && sidebarOpen && viewportH) {
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
  }, [
    isDesktop,
    preferCompactVideo,
    patrolTierScroll,
    desktopMaxVisibleRows,
    fillHeightMain,
    gridCols,
    gridRows,
    safeCams.length,
    selectedIds.join(','),
    sidebarOpen,
    portraitMaxRows,
    mobileCompactVideo,
    mobileStackedNoScroll,
  ])

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

  const compactSidebarPx = sidebarCompactPx ?? 108
  const collapsedSidebarPx = sidebarCollapsedPx ?? 32
  const sidebarRailPx = sidebarOpen ? compactSidebarPx : collapsedSidebarPx
  const compactGridStyle = preferCompactVideo
    ? { gridTemplateColumns: `minmax(0, 1fr) ${sidebarRailPx}px` } as const
    : undefined
  const thumbCompact = sidebarThumbCompact || !isDesktop
  const thumbStrip = isDesktop && !sidebarThumbFullWidth
  const thumbMini = sidebarThumbCompact && sidebarThumbFullWidth
  const collapsedCompact = sidebarThumbCompact && !sidebarOpen

  return (
    <div
        className={cn(
          'w-full min-h-0 h-full',
          preferCompactVideo
            ? 'grid items-stretch min-h-0 flex-none lg:flex-none'
            : cn(
              'flex flex-col lg:flex-row',
              !isDesktop && [
                'max-lg:landscape:grid max-lg:landscape:items-stretch max-lg:landscape:min-h-0',
              ],
            ),
          aspectGridInTier
            ? 'lg:flex-1 lg:min-h-0'
            : mobileCompactVideo
              ? 'lg:h-auto lg:max-h-full'
              : patrolTierScroll
                ? 'lg:h-auto lg:flex-none'
                : 'lg:flex-1 lg:min-h-0',
        )}
        style={{
          ...compactGridStyle,
          ...(sidebarCompactPx != null && !preferCompactVideo && !isDesktop
            ? { gridTemplateColumns: `minmax(0, 1fr) ${sidebarRailPx}px` }
            : {}),
        }}
      >
        <div className={cn(
          'flex flex-1 min-h-0 min-w-0 p-2 max-lg:pb-1 lg:min-h-0 max-lg:landscape:min-w-0',
          preferCompactVideo && 'min-w-0',
          mobileFillPanel && 'overflow-hidden',
        )}>
          <div
            ref={videoGridRef}
            className={cn(
              'w-full',
              patrolTierScroll ? 'shrink-0' : 'min-h-0 flex-1',
              fillHeightMain && !mobileFillPanel && !patrolTierScroll
                ? 'overflow-hidden'
                : 'overflow-y-auto overflow-x-hidden overscroll-y-contain',
            )}
            style={mobileViewportH && !mobileStackedNoScroll ? { maxHeight: mobileViewportH } : undefined}
          >
            <CameraGrid
              cams={safeCams}
              stackedPortrait={stackedPortrait}
              fillHeight={fillHeightMain}
              forceSingleCol={mobileStackedNoScroll && !isDesktop}
              compactVideo={useCompactVideoCaps}
              compactVideoMaxClass={compactVideoMaxClass}
              aspectVideoGrid={aspectVideoGrid}
              fixedRowHeightPx={gridRowHeightPx}
              streamWhenOffline={streamWhenOffline}
            />
          </div>
        </div>

        <div
          className={cn(
            'shrink-0 flex flex-col border-[#1e2433] transition-all duration-200 min-h-0',
            'border-t lg:border-t-0 lg:border-l',
            sidebarCompactClass,
            'lg:overflow-hidden',
            preferCompactVideo && sidebarOpen && 'border-t-0 border-l',
            sidebarOpen
              ? cn('w-full lg:h-full lg:min-h-0', !preferCompactVideo && sidebarOpenClass)
              : cn(
                collapsedCompact
                  ? 'shrink-0 self-end w-7 min-h-[1.75rem] border-t border-[#1e2433] lg:border-t-0 lg:self-auto'
                  : 'w-full shrink-0 min-h-[2.25rem] border-t border-[#1e2433] lg:border-t-0',
                sidebarCollapsedClass,
                'lg:flex lg:h-full lg:min-h-0 lg:items-center lg:justify-center lg:px-0',
              ),
          )}
          style={{
            ...(landscapeSidebarH ? { maxHeight: landscapeSidebarH } : {}),
            ...(preferCompactVideo && sidebarOpen ? { width: compactSidebarPx } : {}),
            ...(preferCompactVideo && !sidebarOpen ? { width: collapsedSidebarPx } : {}),
          }}
        >
          {sidebarOpen ? (
            <>
              <div className={cn(
                'flex items-center gap-1.5 border-b border-[#1e2433] shrink-0',
                thumbMini ? 'px-1 py-1' : 'px-2 py-1.5 lg:px-2.5 lg:py-2',
              )}>
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0 flex-1">
                  {tabs.map(tab => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setFilterTab(tab)}
                      className={cn(
                        'font-semibold rounded whitespace-nowrap transition-colors shrink-0',
                        thumbMini
                          ? 'px-1 py-0.5 text-[7px]'
                          : 'px-1.5 lg:px-2 py-0.5 lg:py-1 text-[8px] lg:text-[9px]',
                        filterTab === tab
                          ? 'bg-primary/20 text-primary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-[#1a2235]',
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <span className={cn(
                  'text-muted-foreground/60 whitespace-nowrap shrink-0 tabular-nums',
                  thumbMini ? 'text-[7px]' : 'text-[8px] lg:text-[9px]',
                )}>
                  <span className="text-primary font-semibold">{selectedIds.length}</span> luồng
                </span>
                {!sidebarThumbCompact && (
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
                )}
              </div>

              <div className={cn(
                'overflow-y-auto overscroll-y-contain',
                thumbMini ? 'px-1 py-1' : 'px-1.5 py-1.5 lg:px-2.5 lg:py-2.5',
                stackedMobile
                  ? 'shrink-0 max-h-[min(24dvh,168px)]'
                  : 'flex-1 min-h-0',
              )}>
                <div className={cn('flex flex-col', thumbMini ? 'gap-1' : 'gap-2 lg:gap-3')}>
                  {sidebarGroups.map(({ key, cameras }) => (
                    <div key={key}>
                      <div className={cn(
                        'flex items-center gap-1.5',
                        thumbMini ? 'mb-0.5' : 'mb-1 lg:mb-2',
                      )}>
                        <span className={cn(
                          'font-bold text-muted-foreground/70 uppercase tracking-widest whitespace-nowrap',
                          thumbMini ? 'text-[7px]' : 'text-[8px] lg:text-[9px]',
                        )}>
                          {key}
                        </span>
                        <div className="flex-1 h-px bg-[#1e2433]" />
                        <span className={cn(
                          'text-muted-foreground/40 shrink-0',
                          thumbMini ? 'text-[7px]' : 'text-[8px] lg:text-[9px]',
                        )}>
                          {cameras.length}
                        </span>
                      </div>
                      <div className={cn(
                        isDesktop
                          ? cn('flex flex-col', thumbMini ? 'gap-0.5' : 'gap-1 lg:gap-1.5')
                          : 'grid grid-cols-3 max-[360px]:grid-cols-2 gap-1',
                      )}>
                        {cameras.map(cam => (
                          <CameraThumb
                            key={cam.id}
                            cam={cam}
                            selected={selectedIds.includes(cam.id)}
                            onClick={() => handleThumbClick(cam)}
                            compact={thumbCompact}
                            strip={thumbStrip}
                            mini={thumbMini}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {sidebarThumbCompact && (
                <div className={cn(
                  'shrink-0 border-t border-[#1e2433] flex items-center justify-center',
                  thumbMini ? 'py-0.5' : 'py-1',
                )}>
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      'rounded text-muted-foreground hover:text-foreground hover:bg-[#1a2235] transition-colors',
                      thumbMini ? 'p-0.5' : 'p-1',
                    )}
                    title="Thu gọn danh sách camera"
                    aria-expanded={sidebarOpen}
                    aria-label="Thu gọn danh sách camera"
                  >
                    {stackedMobile
                      ? <ChevronDown className="w-3 h-3" />
                      : <ChevronRight className="w-3 h-3" />}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className={cn(
              collapsedCompact
                ? 'flex items-center justify-center w-full h-full min-h-[1.75rem] lg:min-h-0'
                : 'flex items-center gap-1.5 px-2 py-1.5 w-full min-h-[2.25rem] lg:flex-col lg:items-center lg:justify-center lg:h-full lg:min-h-[2.5rem] lg:px-0 lg:gap-0 lg:border-t-0',
            )}>
              {!collapsedCompact && (
                <>
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
                </>
              )}
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className={cn(
                  'rounded text-muted-foreground hover:text-foreground hover:bg-[#1a2235] transition-colors shrink-0',
                  collapsedCompact ? 'p-0.5' : 'p-1 lg:p-1.5',
                )}
                title="Mở danh sách camera"
                aria-expanded={sidebarOpen}
                aria-label="Mở danh sách camera"
              >
                <ChevronLeft className={cn(collapsedCompact ? 'w-3 h-3' : 'w-3 h-3 lg:w-3.5 lg:h-3.5')} />
              </button>
            </div>
          )}
        </div>
      </div>
  )
}

export type { TrainingCamera }
