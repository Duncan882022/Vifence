import { useState, useEffect, useMemo, useRef } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Video } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useShellLayout } from '@/hooks/useShellLayout'
import { CameraJsmpegFeed } from './CameraJsmpegFeed'
import { CameraVideoFeed } from './CameraVideoFeed'
import { getStreamUrlForCamera } from '../data/trainingCameraFeeds'
import { useCameras, type CameraWithWorker } from '../hooks/useCameras'
import { TRAINING_LIST_STATE_TEXT, TRAINING_LIST_STATE_WRAP } from './trainingListStates'
import { CCTV_SCANLINE, CameraThumb } from './TrainingCameraShell'
import { useCameraLiveStore } from '../store/cameraLiveStore'
import {
  CAMERA_LOCATION_ALL,
  getCameraLocationTabs,
  groupCamerasByLocation,
} from '../services/cameraFilter.service'

function CameraCell({ cam, compact }: {
  cam: CameraWithWorker; compact?: boolean
}) {
  const mp4Url = getStreamUrlForCamera(cam.id)

  return (
    <div className="relative w-full h-full overflow-hidden rounded-lg bg-[#060b14] border border-[#1e2433]">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f1922] via-[#0a1219] to-[#060d14]" />

      {cam.wsUrl ? (
        <CameraJsmpegFeed wsUrl={cam.wsUrl} cameraId={cam.id} />
      ) : mp4Url ? (
        <CameraVideoFeed
          cameraId={cam.id}
          zone={cam.address ?? ''}
          src={mp4Url}
          compact={compact}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground/40">
          <Video className="w-8 h-8" />
          <span className="text-[9px]">Chưa có stream</span>
        </div>
      )}

      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={CCTV_SCANLINE} />

      <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-1 z-20">
        <div className="flex items-center gap-1 min-w-0">
          <span className={cn(
            'bg-red-500/90 text-white font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0',
            compact ? 'text-[8px]' : 'text-[10px]',
          )}>
            <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
            LIVE
          </span>
        </div>
      </div>

      <div className={cn(
        'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent z-20',
        compact ? 'px-2 pt-5 pb-1.5' : 'px-3 pt-10 pb-3',
      )}>
        <div className="flex items-center justify-between gap-2">
          <span className={cn('font-semibold text-white tracking-wide truncate', compact ? 'text-[9px]' : 'text-[13px]')}>
            {cam.name}
          </span>
          {cam.address && (
            <span className={cn(
              'shrink-0 bg-blue-500/25 border border-blue-500/40 text-blue-200 rounded-full font-medium',
              compact ? 'text-[7px] px-1.5 py-0.5' : 'text-[9px] px-2.5 py-0.5',
            )}>
              {cam.address}
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
  if (stackedPortrait && count > 6) return 2
  if (count <= 4) return 2
  if (count <= 9) return 3
  return 4
}

/** Chỉ co giãn fill viewport khi ít luồng; nhiều luồng giữ aspect-video + cuộn */
const FILL_HEIGHT_MAX_STREAMS = 6
const MOBILE_PORTRAIT_MAX_VISIBLE_ROWS = 4
const MOBILE_LANDSCAPE_MAX_VISIBLE_ROWS = 3
const GRID_GAP_PX = 6
/** p-2 top + max-lg:pb-1 bottom trên cột video */
const MOBILE_VIDEO_COL_PAD_Y = 12

function shouldFillHeight(isDesktop: boolean, streamCount: number): boolean {
  return isDesktop && streamCount <= FILL_HEIGHT_MAX_STREAMS
}

/** Chiều cao vùng video mobile theo số hàng hiển thị, giữ aspect-video */
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

function CameraGrid({ cams, stackedPortrait, fillHeight, forceSingleCol }: {
  cams: CameraWithWorker[]
  stackedPortrait: boolean
  fillHeight: boolean
  forceSingleCol?: boolean
}) {
  const count = cams.length
  const cols = getGridCols(count, stackedPortrait, forceSingleCol)
  const rows = Math.ceil(count / cols)
  const compact = count > 2

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
      {cams.map(cam => (
        <div
          key={cam.id}
          className={cn(
            'relative w-full min-w-0 shrink-0',
            fillHeight ? 'h-full min-h-[120px]' : 'aspect-video',
          )}
        >
          <CameraCell cam={cam} compact={compact} />
        </div>
      ))}
    </div>
  )
}

interface TrainingCameraPanelProps {
  onSelectCamera?: (cam: CameraWithWorker) => void
  selectedId?: string
  onStreamCountChange?: (count: number) => void
}

export function TrainingCameraPanel({ onSelectCamera, selectedId, onStreamCountChange }: TrainingCameraPanelProps) {
  const { cameras, loading } = useCameras()
  const { selectedIds, setSelectedIds } = useCameraLiveStore()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [locationTab, setLocationTab] = useState(CAMERA_LOCATION_ALL)
  const videoGridRef = useRef<HTMLDivElement>(null)
  const [landscapeSidebarH, setLandscapeSidebarH] = useState<number | null>(null)
  const [mobileViewportH, setMobileViewportH] = useState<number | null>(null)
  const { isDesktop } = useShellLayout()
  /** Mobile portrait + landscape — cùng UX chọn luồng như GitHub Pages */
  const stackedMobile = !isDesktop
  const stackedPortrait = stackedMobile

  const locationFilterTabs = useMemo(() => getCameraLocationTabs(cameras), [cameras])
  const sidebarGroups = useMemo(
    () => groupCamerasByLocation(cameras, locationTab),
    [cameras, locationTab],
  )

  useEffect(() => {
    if (!locationFilterTabs.includes(locationTab)) {
      setLocationTab(CAMERA_LOCATION_ALL)
    }
  }, [locationFilterTabs, locationTab])

  useEffect(() => {
    if (cameras.length > 0 && selectedIds.length === 0) {
      setSelectedIds(cameras.slice(0, 2).map(c => c.id))
    }
  }, [cameras, selectedIds, setSelectedIds])

  useEffect(() => {
    if (!selectedId) return
    setSelectedIds(prev => (prev.includes(selectedId) ? prev : [...prev, selectedId]))
  }, [selectedId, setSelectedIds])

  const displayedCams = selectedIds
    .map(id => cameras.find(c => c.id === id))
    .filter((c): c is CameraWithWorker => !!c)
  const safeCams = displayedCams.length > 0 ? displayedCams : cameras.slice(0, 2)
  const fillHeightMain = shouldFillHeight(isDesktop, safeCams.length)

  useEffect(() => {
    onStreamCountChange?.(safeCams.length)
  }, [safeCams.length, onStreamCountChange])

  const gridCols = useMemo(
    () => getGridCols(safeCams.length, stackedPortrait),
    [safeCams.length, stackedPortrait],
  )
  const gridRows = useMemo(
    () => Math.ceil(safeCams.length / gridCols),
    [safeCams.length, gridCols],
  )

  /** Mobile: chiều cao vùng video theo luồng đang chọn; landscape: sidebar khớp cột video */
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

  const handleThumbClick = (cam: CameraWithWorker) => {
    setSelectedIds(prev => {
      if (prev.includes(cam.id)) {
        if (prev.length <= 1) return prev
        const next = prev.filter(id => id !== cam.id)
        const syncCam = cameras.find(c => c.id === next[0])
        if (syncCam) onSelectCamera?.(syncCam)
        return next
      }
      onSelectCamera?.(cam)
      return [...prev, cam.id]
    })
  }

  if (loading) {
    return (
      <div className={cn(TRAINING_LIST_STATE_WRAP, 'h-full')}>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/60" />
      </div>
    )
  }

  if (cameras.length === 0) {
    return (
      <div className={cn(TRAINING_LIST_STATE_WRAP, 'h-full')}>
        <p className={TRAINING_LIST_STATE_TEXT}>Chưa có camera nào được cấu hình</p>
      </div>
    )
  }

  return (
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
            className={cn(
              'w-full min-h-0',
              'max-lg:overflow-y-auto max-lg:overflow-x-hidden max-lg:overscroll-y-contain max-lg:shrink-0',
              'lg:h-full lg:min-h-0 lg:overflow-y-auto lg:overflow-x-hidden lg:overscroll-y-contain',
            )}
            style={!isDesktop && mobileViewportH
              ? { height: mobileViewportH, maxHeight: mobileViewportH }
              : undefined}
          >
            <CameraGrid
              cams={safeCams}
              stackedPortrait={stackedPortrait}
              fillHeight={fillHeightMain}
            />
          </div>
        </div>

        <div
          className={cn(
            'shrink-0 flex flex-col border-[#1e2433] transition-all duration-200 min-h-0',
            'border-t lg:border-t-0 lg:border-l',
            'max-lg:landscape:border-t-0 max-lg:landscape:border-l max-lg:landscape:w-[168px]',
            'max-lg:landscape:min-h-0 max-lg:landscape:overflow-hidden max-lg:landscape:overflow-x-hidden max-lg:landscape:self-start',
            'lg:overflow-hidden',
            sidebarOpen
              ? 'w-full lg:w-[220px] lg:h-full lg:min-h-0 max-lg:landscape:flex max-lg:landscape:flex-col'
              : 'w-full shrink-0 lg:flex lg:w-8 lg:h-full lg:min-h-0',
          )}
          style={landscapeSidebarH && sidebarOpen && !isDesktop
            ? { height: landscapeSidebarH }
            : undefined}
        >
          {sidebarOpen ? (
            <>
              <div className="flex items-center gap-1.5 px-2 py-1.5 lg:px-2.5 lg:py-2 border-b border-[#1e2433] shrink-0">
                {locationFilterTabs.length > 1 ? (
                  <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0 flex-1">
                    {locationFilterTabs.map(tab => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setLocationTab(tab)}
                        className={cn(
                          'px-1.5 lg:px-2 py-0.5 lg:py-1 text-[8px] lg:text-[9px] font-semibold rounded whitespace-nowrap transition-colors shrink-0',
                          locationTab === tab
                            ? 'bg-primary/20 text-primary'
                            : 'text-muted-foreground hover:text-foreground hover:bg-[#1a2235]',
                        )}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="text-[8px] lg:text-[9px] font-bold text-muted-foreground/70 uppercase tracking-widest truncate flex-1">
                    Tất cả
                  </span>
                )}
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
                'px-1.5 py-1.5 lg:px-2.5 lg:py-2.5 overflow-y-auto overflow-x-hidden overscroll-y-contain min-h-0',
                stackedMobile
                  ? 'max-lg:portrait:shrink-0 max-lg:portrait:max-h-[min(36vh,280px)] max-lg:landscape:flex-1 max-lg:landscape:min-h-0'
                  : 'flex-1',
              )}>
                <div className="flex flex-col gap-2 lg:gap-3 min-w-0">
                  {sidebarGroups.map(({ key, cameras: groupCams }) => (
                    <div key={key} className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-1 lg:mb-2 min-w-0">
                        <span className="text-[8px] lg:text-[9px] font-bold text-muted-foreground/70 uppercase tracking-widest truncate min-w-0">
                          {key}
                        </span>
                        <div className="flex-1 h-px bg-[#1e2433] shrink-0" />
                        <span className="text-[8px] lg:text-[9px] text-muted-foreground/40 shrink-0">
                          {groupCams.length}
                        </span>
                      </div>
                      <div className={cn(
                        'min-w-0 overflow-x-hidden',
                        'max-lg:portrait:grid max-lg:portrait:grid-cols-3 max-lg:portrait:max-[360px]:grid-cols-2 max-lg:portrait:gap-1',
                        'max-lg:landscape:flex max-lg:landscape:flex-col max-lg:landscape:gap-1.5',
                        'lg:flex lg:flex-col lg:gap-2',
                      )}>
                        {groupCams.map(cam => (
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
              {locationFilterTabs.length > 1 && (
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0 flex-1 lg:hidden">
                  {locationFilterTabs.map(tab => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setLocationTab(tab)}
                      className={cn(
                        'px-1.5 py-0.5 text-[8px] font-semibold rounded whitespace-nowrap transition-colors shrink-0',
                        locationTab === tab
                          ? 'bg-primary/20 text-primary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-[#1a2235]',
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              )}
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
  )
}

export type { CameraWithWorker }
