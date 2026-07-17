import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, History, Video } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useShellLayout } from '@/hooks/useShellLayout'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import type { CameraWithWorker } from '../hooks/useCameras'

export const CCTV_SCANLINE = {
  backgroundImage:
    'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 4px)',
} as const

const STATUS_DOT: Record<string, string> = {
  streaming:                  'bg-green-400',
  recording_event:            'bg-amber-400',
  recording_continuous:       'bg-blue-400',
  recording_continuous_event:  'bg-emerald-400',
  stopped:                    'bg-muted-foreground',
}

export function CameraThumb({
  cam,
  selected,
  onClick,
  compact = false,
  strip = false,
  variant = 'live',
}: {
  cam: CameraWithWorker
  selected: boolean
  onClick: () => void
  compact?: boolean
  strip?: boolean
  variant?: 'live' | 'playback'
}) {
  const dotColor = STATUS_DOT[cam.status] ?? 'bg-muted-foreground'
  const isPlayback = variant === 'playback'

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
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-muted-foreground/30">
        <Video className="w-4 h-4" />
      </div>

      <span className="absolute top-0.5 left-0.5 flex items-center gap-0.5 z-10">
        {isPlayback ? (
          <>
            <History className={cn('text-amber-400', compact ? 'w-2 h-2' : 'w-2.5 h-2.5')} />
            {!compact && (
              <span className="text-[7px] text-amber-400/80 font-bold tracking-tight">REC</span>
            )}
          </>
        ) : (
          <>
            <span className={cn('rounded-full animate-pulse', compact ? 'w-0.5 h-0.5' : 'w-1 h-1', dotColor)} />
            <span className={cn('text-red-400 font-bold tracking-tight', compact ? 'text-[5px]' : 'text-[7px]')}>LIVE</span>
          </>
        )}
      </span>

      <div className={cn(
        'absolute top-0.5 right-0.5 rounded-sm border-2 flex items-center justify-center transition-all z-10',
        compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5',
        selected
          ? 'bg-primary border-primary'
          : 'border-white/30 bg-black/30 opacity-0 group-hover:opacity-100',
      )}>
        {selected && <Check className={cn('text-white', compact ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5')} strokeWidth={3} />}
      </div>

      <div className={cn(
        'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/75 to-transparent z-10',
        compact ? 'px-1 pb-1 pt-2' : 'px-1.5 pb-1.5 pt-4',
      )}>
        <p className={cn(
          'text-white/90 font-semibold truncate leading-snug',
          compact ? 'text-[6.5px]' : 'text-[9px]',
        )}>
          {cam.name}
        </p>
        {cam.address && (
          <p className={cn('text-blue-300/80 truncate leading-tight', compact ? 'text-[5.5px]' : 'text-[7.5px]')}>
            {cam.address}
          </p>
        )}
      </div>
    </div>
  )
}

export interface TrainingCameraShellProps {
  cameras: CameraWithWorker[]
  selectedIds: string[]
  onThumbClick: (cam: CameraWithWorker) => void
  sidebarSummary: ReactNode
  thumbVariant?: 'live' | 'playback'
  sidebarFooter?: ReactNode
  /** Nhóm camera theo vị trí — sidebar listing */
  sidebarGroups?: { key: string; cameras: CameraWithWorker[] }[]
  /** Tab lọc theo địa chỉ / vị trí */
  locationFilterTabs?: string[]
  activeLocationTab?: string
  onLocationTabChange?: (tab: string) => void
  /** Playback: tab Camera | AI thay vì xếp chồng */
  sidebarTabbed?: boolean
  /** Ẩn sidebar cạnh trên mobile (portrait + landscape) — dùng panel inline */
  hideStackedPortraitSidebar?: boolean
  /** Ẩn strip camera ngang trên mobile landscape (dùng inline panel) */
  hideLandscapeMobileStrip?: boolean
  children: ReactNode
}

export function TrainingCameraShell({
  cameras,
  selectedIds,
  onThumbClick,
  sidebarSummary,
  thumbVariant = 'live',
  sidebarFooter,
  sidebarGroups,
  locationFilterTabs,
  activeLocationTab,
  onLocationTabChange,
  sidebarTabbed = false,
  hideStackedPortraitSidebar = false,
  hideLandscapeMobileStrip = false,
  children,
}: TrainingCameraShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarTab, setSidebarTab] = useState<'camera' | 'ai'>('camera')
  const { isDesktop } = useShellLayout()
  const isLandscapeMobile = useMediaQuery('(max-width: 1023px) and (orientation: landscape)')
  const stackedPortrait = !isDesktop && !isLandscapeMobile
  const useTabbedSidebar = sidebarTabbed && !!sidebarFooter
  const hasLocationFilters = !!locationFilterTabs?.length && !!onLocationTabChange
  const isLiveLandscape = isLandscapeMobile && thumbVariant === 'live'

  const primaryCam = cameras.find(c => c.id === selectedIds[0])
  const sidebarListingCameras = sidebarGroups?.flatMap(group => group.cameras) ?? cameras

  const renderThumbGrid = (list: CameraWithWorker[], compact = !isDesktop || sidebarTabbed, strip = sidebarTabbed && !isDesktop) => (
    <div className={cn(
      'min-w-0 overflow-x-hidden',
      strip
        ? 'flex flex-col gap-1.5 max-lg:[&>*]:w-full lg:gap-2'
        : cn(
            'max-lg:portrait:grid max-lg:portrait:grid-cols-3 max-lg:portrait:max-[360px]:grid-cols-2 max-lg:portrait:gap-1',
            'max-lg:landscape:flex max-lg:landscape:flex-col max-lg:landscape:gap-1.5',
            'lg:flex lg:flex-col lg:gap-2',
          ),
    )}>
      {list.map(cam => (
        <CameraThumb
          key={cam.id}
          cam={cam}
          selected={selectedIds.includes(cam.id)}
          onClick={() => onThumbClick(cam)}
          compact={compact}
          strip={strip}
          variant={thumbVariant}
        />
      ))}
    </div>
  )

  const filterTabButtons = hasLocationFilters ? (
    locationFilterTabs!.map(tab => (
      <button
        key={tab}
        type="button"
        onClick={() => onLocationTabChange!(tab)}
        className={cn(
          'px-1.5 lg:px-2 py-0.5 lg:py-1 text-[8px] lg:text-[9px] font-semibold rounded whitespace-nowrap transition-colors shrink-0',
          activeLocationTab === tab
            ? 'bg-primary/20 text-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-[#1a2235]',
        )}
      >
        {tab}
      </button>
    ))
  ) : null

  const groupedSidebarList = sidebarGroups && sidebarGroups.length > 0 ? (
    <div className="flex flex-col gap-2 lg:gap-3">
      {sidebarGroups.map(({ key, cameras: groupCams }) => (
        <div key={key}>
          <div className="flex items-center gap-1.5 mb-1 lg:mb-2">
            <span className="text-[8px] lg:text-[9px] font-bold text-muted-foreground/70 uppercase tracking-widest truncate min-w-0">
              {key}
            </span>
            <div className="flex-1 h-px bg-[#1e2433]" />
            <span className="text-[8px] lg:text-[9px] text-muted-foreground/40 shrink-0">
              {groupCams.length}
            </span>
          </div>
          {renderThumbGrid(groupCams)}
        </div>
      ))}
      {sidebarFooter}
    </div>
  ) : null

  const cameraThumbGrid = renderThumbGrid(sidebarListingCameras)

  const groupedCameraSections = sidebarGroups && sidebarGroups.length > 0 ? (
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
          {renderThumbGrid(groupCams)}
        </div>
      ))}
    </div>
  ) : cameraThumbGrid

  const sidebarBody = useTabbedSidebar ? (
    <>
      <div className="flex border-b border-[#1e2433] shrink-0">
        <button
          type="button"
          onClick={() => setSidebarTab('camera')}
          className={cn(
            'flex-1 px-2 py-1.5 text-[8px] lg:text-[9px] font-bold uppercase tracking-wide transition-colors',
            sidebarTab === 'camera'
              ? 'text-amber-400 border-b-2 border-amber-400/80 bg-amber-500/5'
              : 'text-muted-foreground/60 hover:text-foreground',
          )}
        >
          Camera ({cameras.length})
        </button>
        <button
          type="button"
          onClick={() => setSidebarTab('ai')}
          className={cn(
            'flex-1 px-2 py-1.5 text-[8px] lg:text-[9px] font-bold uppercase tracking-wide transition-colors',
            sidebarTab === 'ai'
              ? 'text-amber-400 border-b-2 border-amber-400/80 bg-amber-500/5'
              : 'text-muted-foreground/60 hover:text-foreground',
          )}
        >
          AI
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain">
        {sidebarTab === 'camera' ? (
          <div className="p-1.5 lg:p-2">{groupedCameraSections}</div>
        ) : (
          <div className="p-1.5 lg:p-2">{sidebarFooter}</div>
        )}
      </div>
    </>
  ) : groupedSidebarList ?? (
    <div className="flex flex-col gap-2 lg:gap-3">
      <div>
        <div className="flex items-center gap-1.5 mb-1 lg:mb-2">
          <span className="text-[8px] lg:text-[9px] font-bold text-muted-foreground/70 uppercase tracking-widest whitespace-nowrap">
            Tất cả ({cameras.length})
          </span>
          <div className="flex-1 h-px bg-[#1e2433]" />
        </div>
        {cameraThumbGrid}
      </div>
      {sidebarFooter}
    </div>
  )

  useEffect(() => {
    if (isLandscapeMobile) setSidebarOpen(false)
  }, [isLandscapeMobile])

  return (
    <div className={cn(
      stackedPortrait
        ? 'flex max-lg:flex-col max-lg:h-auto max-lg:flex-none max-lg:min-h-0'
        : 'flex flex-1 min-h-0 h-full w-full',
      isLiveLandscape && 'grid min-h-0 h-full grid-rows-[1fr_auto]',
      isLandscapeMobile && !isLiveLandscape && 'flex flex-col h-auto max-lg:min-h-0',
      !stackedPortrait && !isLandscapeMobile && 'flex-col max-lg:landscape:flex-row lg:flex-row',
    )}>
      <div className={cn(
        'min-h-0 min-w-0',
        isLiveLandscape && 'row-start-1 flex items-center justify-center overflow-hidden p-1',
        isLandscapeMobile && !isLiveLandscape && 'flex items-center justify-center p-1 shrink-0',
        !isLandscapeMobile && 'p-2 lg:flex-1 lg:min-w-0 lg:min-h-0 max-lg:pb-1',
        stackedPortrait && 'max-lg:flex-none max-lg:shrink-0',
        !isLandscapeMobile && !stackedPortrait && 'max-lg:landscape:flex-1 max-lg:landscape:min-h-0 max-lg:landscape:min-w-0',
      )}>
        <div className={cn(
          'min-h-0 min-w-0 w-full',
          stackedPortrait && 'max-lg:h-auto max-lg:overflow-visible',
          isLiveLandscape && 'h-full flex items-center justify-center',
          isLandscapeMobile && !isLiveLandscape && 'w-full max-w-[min(100%,calc((100dvh-64px)*16/9))]',
          !isLandscapeMobile && !stackedPortrait && 'h-full max-lg:landscape:overflow-y-auto max-lg:landscape:overflow-x-hidden max-lg:landscape:overscroll-y-contain',
          'lg:min-h-0 lg:h-full lg:overflow-y-auto lg:overflow-x-hidden lg:overscroll-y-contain lg:flex lg:flex-col',
        )}>
          {children}
        </div>
      </div>

      {isLandscapeMobile && !hideLandscapeMobileStrip ? (
        <div className={cn(
          'shrink-0 border-t border-[#1e2433] bg-[#0a0e14]',
          isLiveLandscape && 'row-start-2',
        )}>
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-[#1e2433] shrink-0">
            <div className="min-w-0">
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Chọn camera</p>
              <p className="text-[8px] text-muted-foreground/60 truncate">
                {primaryCam ? primaryCam.name : '—'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(open => !open)}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-[#1a2235] transition-colors shrink-0"
            >
              {sidebarOpen ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>
          </div>
          {sidebarOpen && (
            <div className="flex gap-1.5 px-2 py-1.5 overflow-x-auto scrollbar-none overscroll-x-contain max-h-[76px]">
              {sidebarListingCameras.map(cam => (
                <CameraThumb
                  key={cam.id}
                  cam={cam}
                  selected={selectedIds.includes(cam.id)}
                  onClick={() => onThumbClick(cam)}
                  compact
                  strip
                  variant={thumbVariant}
                />
              ))}
            </div>
          )}
        </div>
      ) : !(hideStackedPortraitSidebar && (stackedPortrait || isLandscapeMobile)) ? (
        <div className={cn(
          'shrink-0 flex flex-col border-[#1e2433] transition-all duration-200',
          'border-t lg:border-t-0 lg:border-l',
          'max-lg:landscape:border-t-0 max-lg:landscape:border-l',
          stackedPortrait && 'max-lg:flex-none max-lg:overflow-visible',
          'max-lg:landscape:flex-none max-lg:landscape:w-[168px] max-lg:landscape:min-h-0 max-lg:landscape:h-auto max-lg:landscape:overflow-hidden',
          'lg:overflow-hidden',
          sidebarOpen
            ? 'w-full lg:w-[220px] lg:h-full lg:min-h-0'
            : cn(
                'w-full lg:w-8 lg:h-full lg:min-h-0 lg:flex',
                !stackedPortrait && 'hidden lg:flex',
              ),
        )}>
          {sidebarOpen ? (
            <>
              <div className={cn(
                'border-b border-[#1e2433] shrink-0',
                hasLocationFilters
                  ? 'flex items-center gap-1.5 px-2 py-1.5 lg:px-2.5 lg:py-2'
                  : 'px-2 py-1.5 lg:px-2.5 lg:py-2.5',
              )}>
                {hasLocationFilters ? (
                  <>
                    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0 flex-1">
                      {filterTabButtons}
                    </div>
                    <span className="text-[8px] lg:text-[9px] text-muted-foreground/60 whitespace-nowrap shrink-0 tabular-nums">
                      {sidebarSummary}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSidebarOpen(false)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-[#1a2235] transition-colors shrink-0"
                      title="Thu gọn"
                      aria-expanded
                    >
                      {stackedPortrait ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[8px] lg:text-[9px] text-muted-foreground/60 min-w-0">
                      {sidebarSummary}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSidebarOpen(false)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-[#1a2235] transition-colors shrink-0"
                      title="Thu gọn"
                      aria-expanded
                    >
                      {stackedPortrait ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                )}
              </div>
              <div className={cn(
                'px-1.5 py-1.5 lg:px-2.5 lg:py-2.5 flex flex-col min-h-0',
                useTabbedSidebar
                  ? 'flex-1 overflow-hidden p-0'
                  : stackedPortrait
                    ? 'shrink-0 max-h-[min(36vh,280px)] overflow-y-auto overflow-x-hidden overscroll-y-contain'
                    : 'flex-1 overflow-y-auto overflow-x-hidden',
              )}>
                {sidebarBody}
              </div>
            </>
          ) : stackedPortrait ? (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex w-full items-center justify-between gap-2 px-2 py-2 text-left hover:bg-[#1a2235]/40 transition-colors"
              aria-expanded={false}
            >
              <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto scrollbar-none">
                {hasLocationFilters ? filterTabButtons : (
                  <span className="text-[8px] text-muted-foreground/60 min-w-0">
                    {sidebarSummary}
                  </span>
                )}
              </div>
              {!hasLocationFilters && (
                <span className="text-[8px] text-muted-foreground/60 whitespace-nowrap shrink-0 tabular-nums lg:hidden">
                  {sidebarSummary}
                </span>
              )}
              <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            </button>
          ) : (
            <div className={cn(
              'flex items-center gap-1.5 px-2 py-1.5 w-full lg:flex-col lg:items-center lg:justify-center lg:h-full lg:min-h-[2.5rem] lg:px-0 lg:gap-0',
            )}>
              {hasLocationFilters && (
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0 flex-1 lg:hidden">
                  {filterTabButtons}
                </div>
              )}
              {hasLocationFilters && (
                <span className="text-[8px] text-muted-foreground/60 whitespace-nowrap shrink-0 tabular-nums lg:hidden">
                  {sidebarSummary}
                </span>
              )}
              <div className="flex flex-col items-center justify-center h-full min-h-[2.5rem] lg:w-full">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-[#1a2235] transition-colors"
                  title="Mở danh sách camera"
                  aria-expanded={false}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
