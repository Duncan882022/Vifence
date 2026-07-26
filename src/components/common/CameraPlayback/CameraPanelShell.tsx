import { useEffect, useState, type ReactNode } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useShellLayout } from '@/hooks/useShellLayout'
import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import { CameraPlaybackThumb } from './CameraPlaybackThumb'

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )

  useEffect(() => {
    const media = window.matchMedia(query)
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches)
    setMatches(media.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [query])

  return matches
}

interface CameraPanelShellProps {
  cameras: TrainingCamera[]
  selectedIds: string[]
  onThumbClick: (cam: TrainingCamera) => void
  sidebarSummary: ReactNode
  thumbVariant?: 'live' | 'playback'
  sidebarFooter?: ReactNode
  sidebarGroups?: { key: string; cameras: TrainingCamera[] }[]
  locationFilterTabs?: string[]
  activeLocationTab?: string
  onLocationTabChange?: (tab: string) => void
  sidebarTabbed?: boolean
  hideStackedPortraitSidebar?: boolean
  hideLandscapeMobileStrip?: boolean
  children: ReactNode
}

export function CameraPanelShell({
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
}: CameraPanelShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarTab, setSidebarTab] = useState<'camera' | 'ai'>('camera')
  const { isDesktop } = useShellLayout()
  const isLandscapeMobile = useMediaQuery('(max-width: 1023px) and (orientation: landscape)')
  const stackedMobile = !isDesktop && !isLandscapeMobile
  const hasLocationTabs = Boolean(locationFilterTabs?.length && onLocationTabChange)
  const liveLandscapeGrid = isLandscapeMobile && thumbVariant === 'live'
  const selectedCam = cameras.find(cam => cam.id === selectedIds[0])
  const flatCameras = sidebarGroups?.flatMap(g => g.cameras) ?? cameras

  useEffect(() => {
    if (isLandscapeMobile) setSidebarOpen(false)
  }, [isLandscapeMobile])

  const renderThumbs = (
    list: TrainingCamera[],
    compact = !isDesktop || sidebarTabbed,
    strip = sidebarTabbed && !isDesktop,
  ) => (
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
        <CameraPlaybackThumb
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

  const locationTabs = hasLocationTabs
    ? locationFilterTabs!.map(tab => (
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
    : null

  const groupedSidebar = sidebarGroups && sidebarGroups.length > 0
    ? (
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
            {renderThumbs(groupCams)}
          </div>
        ))}
      </div>
    )
    : renderThumbs(flatCameras)

  const sidebarBody = sidebarTabbed && sidebarFooter
    ? (
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
          {sidebarTab === 'camera'
            ? <div className="p-1.5 lg:p-2">{groupedSidebar}</div>
            : <div className="p-1.5 lg:p-2">{sidebarFooter}</div>}
        </div>
      </>
    )
    : (
      <div className="flex flex-col gap-2 lg:gap-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1 lg:mb-2">
            <span className="text-[8px] lg:text-[9px] font-bold text-muted-foreground/70 uppercase tracking-widest whitespace-nowrap">
              Tất cả ({cameras.length})
            </span>
            <div className="flex-1 h-px bg-[#1e2433]" />
          </div>
          {renderThumbs(flatCameras)}
        </div>
        {sidebarFooter}
      </div>
    )

  return (
    <div className={cn(
      stackedMobile
        ? 'flex max-lg:flex-col max-lg:h-auto max-lg:flex-none max-lg:min-h-0'
        : 'flex flex-1 min-h-0 h-full w-full',
      liveLandscapeGrid && 'grid min-h-0 h-full grid-rows-[1fr_auto]',
      isLandscapeMobile && !liveLandscapeGrid && 'flex flex-col h-auto max-lg:min-h-0',
      !stackedMobile && !isLandscapeMobile && 'flex-col max-lg:landscape:flex-row lg:flex-row',
    )}>
      <div className={cn(
        'min-h-0 min-w-0',
        liveLandscapeGrid && 'row-start-1 flex items-center justify-center overflow-hidden p-1',
        isLandscapeMobile && !liveLandscapeGrid && 'flex items-center justify-center p-1 shrink-0',
        !isLandscapeMobile && 'p-2 lg:flex-1 lg:min-w-0 lg:min-h-0 max-lg:pb-1',
        stackedMobile && 'max-lg:flex-none max-lg:shrink-0',
        !isLandscapeMobile && !stackedMobile && 'max-lg:landscape:flex-1 max-lg:landscape:min-h-0 max-lg:landscape:min-w-0',
      )}>
        <div className={cn(
          'min-h-0 min-w-0 w-full',
          stackedMobile && 'max-lg:h-auto max-lg:overflow-visible',
          liveLandscapeGrid && 'h-full flex items-center justify-center',
          isLandscapeMobile && !liveLandscapeGrid && 'w-full max-w-[min(100%,calc((100dvh-64px)*16/9))]',
          !isLandscapeMobile && !stackedMobile && 'h-full max-lg:landscape:overflow-y-auto max-lg:landscape:overflow-x-hidden max-lg:landscape:overscroll-y-contain',
          'lg:min-h-0 lg:h-full lg:overflow-y-auto lg:overflow-x-hidden lg:overscroll-y-contain lg:flex lg:flex-col',
        )}>
          {children}
        </div>
      </div>

      {isLandscapeMobile && !hideLandscapeMobileStrip ? (
        <div className={cn(
          'shrink-0 border-t border-[#1e2433] bg-[#0a0e14]',
          liveLandscapeGrid && 'row-start-2',
        )}>
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-[#1e2433] shrink-0">
            <div className="min-w-0">
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Chọn camera</p>
              <p className="text-[8px] text-muted-foreground/60 truncate">{selectedCam?.name ?? '—'}</p>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(open => !open)}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-[#1a2235] transition-colors shrink-0"
            >
              {sidebarOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
          {sidebarOpen && (
            <div className="flex gap-1.5 px-2 py-1.5 overflow-x-auto scrollbar-none overscroll-x-contain max-h-[76px]">
              {flatCameras.map(cam => (
                <CameraPlaybackThumb
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
      ) : hideStackedPortraitSidebar && (stackedMobile || isLandscapeMobile) ? null : (
        <div className={cn(
          'shrink-0 flex flex-col border-[#1e2433] transition-all duration-200',
          'border-t lg:border-t-0 lg:border-l',
          'max-lg:landscape:border-t-0 max-lg:landscape:border-l',
          stackedMobile && 'max-lg:flex-none max-lg:overflow-visible',
          'max-lg:landscape:flex-none max-lg:landscape:w-[168px] max-lg:landscape:min-h-0 max-lg:landscape:h-auto max-lg:landscape:overflow-hidden',
          'lg:overflow-hidden',
          sidebarOpen
            ? 'w-full lg:w-[220px] lg:h-full lg:min-h-0'
            : cn('w-full lg:w-8 lg:h-full lg:min-h-0 lg:flex', !stackedMobile && 'hidden lg:flex'),
        )}>
          {sidebarOpen ? (
            <>
              <div className={cn(
                'border-b border-[#1e2433] shrink-0',
                hasLocationTabs
                  ? 'flex items-center gap-1.5 px-2 py-1.5 lg:px-2.5 lg:py-2'
                  : 'px-2 py-1.5 lg:px-2.5 lg:py-2.5',
              )}>
                {hasLocationTabs ? (
                  <>
                    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0 flex-1">
                      {locationTabs}
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
                      {stackedMobile
                        ? <ChevronDown className="w-3.5 h-3.5" />
                        : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[8px] lg:text-[9px] text-muted-foreground/60 min-w-0">{sidebarSummary}</span>
                    <button
                      type="button"
                      onClick={() => setSidebarOpen(false)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-[#1a2235] transition-colors shrink-0"
                      title="Thu gọn"
                      aria-expanded
                    >
                      {stackedMobile
                        ? <ChevronDown className="w-3.5 h-3.5" />
                        : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
              </div>
              <div className={cn(
                'px-1.5 py-1.5 lg:px-2.5 lg:py-2.5 flex flex-col min-h-0',
                sidebarTabbed && sidebarFooter
                  ? 'flex-1 overflow-hidden p-0'
                  : stackedMobile
                    ? 'shrink-0 max-h-[min(36vh,280px)] overflow-y-auto overflow-x-hidden overscroll-y-contain'
                    : 'flex-1 overflow-y-auto overflow-x-hidden',
              )}>
                {sidebarBody}
              </div>
            </>
          ) : stackedMobile ? (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex w-full items-center justify-between gap-2 px-2 py-2 text-left hover:bg-[#1a2235]/40 transition-colors"
              aria-expanded={false}
            >
              <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto scrollbar-none">
                {hasLocationTabs ? locationTabs : (
                  <span className="text-[8px] text-muted-foreground/60 min-w-0">{sidebarSummary}</span>
                )}
              </div>
              <ChevronUp className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-1.5 w-full lg:flex-col lg:items-center lg:justify-center lg:h-full lg:min-h-[2.5rem] lg:px-0 lg:gap-0">
              {hasLocationTabs && (
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0 flex-1 lg:hidden">
                  {locationTabs}
                </div>
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
      )}
    </div>
  )
}
