import { useState, useEffect, useRef } from 'react'
import { Maximize2, X, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { Camera } from '@/types/camera'
import { getStreamUrlForCamera } from '../data/trainingCameraFeeds'

interface TrainingCamera extends Camera {
  courseName?: string
}

function withStreamUrl(cam: TrainingCamera): TrainingCamera {
  return { ...cam, streamUrl: getStreamUrlForCamera(cam.id) }
}

const MOCK_CAMERAS: TrainingCamera[] = ([
  /* ── OCP1-A ───────────────────────────────────────────────── */
  { id: 'A-01', name: 'Cam 01', location: 'Cổng vào',          zone: 'OCP1-A', status: 'online' as const },
  { id: 'A-02', name: 'Cam 02', location: 'Phòng Đào Tạo A1',  zone: 'OCP1-A', status: 'online' as const, courseName: 'Toolbox A' },
  { id: 'A-03', name: 'Cam 03', location: 'Phòng Đào Tạo A2',  zone: 'OCP1-A', status: 'online' as const, courseName: 'Cọc nhồi B' },
  { id: 'A-04', name: 'Cam 04', location: 'Sân Tập A',          zone: 'OCP1-A', status: 'online' as const },
  { id: 'A-05', name: 'Cam 05', location: 'Hành Lang',          zone: 'OCP1-A', status: 'online' as const },
  { id: 'A-06', name: 'Cam 06', location: 'Kho Vật Tư',         zone: 'OCP1-A', status: 'online' as const },
  { id: 'A-07', name: 'Cam 07', location: 'Bãi Đỗ Xe',          zone: 'OCP1-A', status: 'online' as const },
  { id: 'A-08', name: 'Cam 08', location: 'Phòng Giải Lao',     zone: 'OCP1-A', status: 'online' as const },
  /* ── OCP1-B ───────────────────────────────────────────────── */
  { id: 'B-01', name: 'Cam 01', location: 'Cổng vào',           zone: 'OCP1-B', status: 'online' as const },
  { id: 'B-02', name: 'Cam 02', location: 'Sân Thực Hành B1',   zone: 'OCP1-B', status: 'online' as const, courseName: 'PCCC C' },
  { id: 'B-03', name: 'Cam 03', location: 'Phòng Đào Tạo B2',   zone: 'OCP1-B', status: 'online' as const, courseName: 'Điện cơ E' },
  { id: 'B-04', name: 'Cam 04', location: 'Phòng Đào Tạo B1',   zone: 'OCP1-B', status: 'online' as const },
  { id: 'B-05', name: 'Cam 05', location: 'Hành Lang',           zone: 'OCP1-B', status: 'online' as const },
  { id: 'B-06', name: 'Cam 06', location: 'Khu Vực Máy Móc',    zone: 'OCP1-B', status: 'online' as const },
  { id: 'B-07', name: 'Cam 07', location: 'Bãi Tập Kết',         zone: 'OCP1-B', status: 'online' as const },
  { id: 'B-08', name: 'Cam 08', location: 'Phòng Y Tế',          zone: 'OCP1-B', status: 'online' as const },
] satisfies Omit<TrainingCamera, 'streamUrl'>[]).map(withStreamUrl)

const ZONE_TABS = ['Tất cả', 'OCP1-A', 'OCP1-B'] as const
type ZoneTab = typeof ZONE_TABS[number]

const CCTV_SCANLINE = {
  backgroundImage:
    'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 4px)',
} as const

/* ── Live video feed (local MP4 loop) ───────────────────────── */
function CameraVideoFeed({ src, playing = true }: { src: string; playing?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (playing) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [src, playing])

  return (
    <video
      ref={videoRef}
      src={src}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      className="absolute inset-0 h-full w-full object-cover saturate-[0.75] contrast-[1.08] brightness-[0.88]"
    />
  )
}

/* ── Thumbnail ──────────────────────────────────────────────── */
function CameraThumb({ cam, selected, onClick }: {
  cam: TrainingCamera; selected: boolean; onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'relative h-[58px] rounded overflow-hidden cursor-pointer border-2 transition-all shrink-0 group',
        selected
          ? 'border-primary shadow-[0_0_0_1px] shadow-primary/30'
          : 'border-[#1e2433] hover:border-primary/50',
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f1922] via-[#0a1219] to-[#060d14]" />
      {cam.streamUrl && <CameraVideoFeed src={cam.streamUrl} />}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={CCTV_SCANLINE} />

      {/* LIVE indicator */}
      <span className="absolute top-1 left-1 flex items-center gap-0.5">
        <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
        <span className="text-[7px] text-red-400 font-bold tracking-tight">LIVE</span>
      </span>

      {/* Tick checkbox */}
      <div className={cn(
        'absolute top-1 right-1 w-3.5 h-3.5 rounded-sm border-2 flex items-center justify-center transition-all',
        selected
          ? 'bg-primary border-primary'
          : 'border-white/30 bg-black/30 opacity-0 group-hover:opacity-100',
      )}>
        {selected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
      </div>

      {/* Bottom labels */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-1.5 pt-4">
        <p className="text-[9px] text-white/90 font-semibold truncate leading-snug">{cam.name}</p>
        {cam.courseName && (
          <p className="text-[7.5px] text-blue-300/80 truncate leading-tight">{cam.courseName}</p>
        )}
      </div>
    </div>
  )
}

/* ── Single camera cell (main area) ────────────────────────── */
function CameraCell({ cam, compact, onMaximize }: {
  cam: TrainingCamera; compact?: boolean; onMaximize: () => void
}) {
  return (
    <div className="relative w-full h-full overflow-hidden rounded-lg bg-[#060b14] border border-[#1e2433]">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f1922] via-[#0a1219] to-[#060d14]" />
      {cam.streamUrl && <CameraVideoFeed src={cam.streamUrl} />}

      {/* Scanline overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={CCTV_SCANLINE} />

      {/* Top row */}
      <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
        <span className={cn(
          'bg-red-500/90 text-white font-bold px-1.5 py-0.5 rounded flex items-center gap-1',
          compact ? 'text-[8px]' : 'text-[10px]',
        )}>
          <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
          LIVE
        </span>
        <button
          onClick={onMaximize}
          className="p-1 rounded bg-black/50 hover:bg-black/80 text-white transition-colors"
          title="Phóng to"
        >
          <Maximize2 className={compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />
        </button>
      </div>

      {/* Bottom info */}
      <div className={cn(
        'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent',
        compact ? 'px-2 pt-5 pb-1.5' : 'px-3 pt-10 pb-3',
      )}>
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            'font-semibold text-white tracking-wide truncate',
            compact ? 'text-[9px]' : 'text-[13px]',
          )}>
            {cam.zone} · {cam.name}
          </span>
          {cam.courseName && (
            <span className={cn(
              'shrink-0 bg-blue-500/25 border border-blue-500/40 text-blue-200 rounded-full font-medium',
              compact ? 'text-[7px] px-1.5 py-0.5' : 'text-[9px] px-2.5 py-0.5',
            )}>
              {cam.courseName}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Multi-camera main area ─────────────────────────────────── */
function CameraGrid({ cams, onMaximize }: {
  cams: TrainingCamera[]
  onMaximize: (cam: TrainingCamera) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setContainerSize({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const count = cams.length

  /* Single camera — use height-first fitting so it never feels "too tall".
     If the container is too portrait (height > width * 9/16 * 1.4), shrink to fit width. */
  if (count === 1) {
    const isTall = containerSize.w > 0 && containerSize.h > containerSize.w * (9 / 16) * 1.2
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center overflow-hidden">
        <div
          className="relative"
          style={
            isTall
              ? { aspectRatio: '16/9', width: '100%', maxHeight: '100%' }
              : { aspectRatio: '16/9', height: '100%', maxWidth: '100%' }
          }
        >
          <CameraCell cam={cams[0]} onMaximize={() => onMaximize(cams[0])} />
        </div>
      </div>
    )
  }

  /* Multi camera — each cell is 16:9, grid scrolls vertically */
  const cols = count <= 4 ? 2 : count <= 9 ? 3 : 4

  return (
    <div ref={containerRef} className="w-full h-full overflow-y-auto overflow-x-hidden">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {cams.map(cam => (
          <div key={cam.id} style={{ aspectRatio: '16/9' }}>
            <CameraCell cam={cam} compact onMaximize={() => onMaximize(cam)} />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Fullscreen overlay ─────────────────────────────────────── */
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
          <div className="flex items-center gap-2">
            <span className="bg-red-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
            </span>
            <span className="text-sm font-semibold text-white">{cam.zone} · {cam.name}</span>
            {cam.courseName && (
              <span className="text-xs text-white/60">— {cam.courseName}</span>
            )}
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors">
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

/* ── Main exported component ────────────────────────────────── */
interface TrainingCameraPanelProps {
  onSelectCamera?: (cam: TrainingCamera) => void
  selectedId?: string
}

export function TrainingCameraPanel({ onSelectCamera, selectedId }: TrainingCameraPanelProps) {
  const defaultCam  = MOCK_CAMERAS.find(c => c.courseName) ?? MOCK_CAMERAS[0]
  const secondCam   = MOCK_CAMERAS.find(c => c.id !== defaultCam.id && c.courseName)
    ?? MOCK_CAMERAS.find(c => c.id !== defaultCam.id)
    ?? MOCK_CAMERAS[1]
  // Default to 2 cameras so the panel doesn't feel too tall with a single stretched feed
  const [selectedIds, setSelectedIds] = useState<string[]>(
    selectedId ? [selectedId] : [defaultCam.id, secondCam.id],
  )
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [zoneTab, setZoneTab] = useState<ZoneTab>('Tất cả')
  const [focusedCam, setFocusedCam] = useState<TrainingCamera | null>(null)

  useEffect(() => {
    if (selectedId && !selectedIds.includes(selectedId)) {
      setSelectedIds([selectedId])
    }
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = zoneTab === 'Tất cả'
    ? MOCK_CAMERAS
    : MOCK_CAMERAS.filter(c => c.zone === zoneTab)

  const grouped = filtered.reduce<Record<string, TrainingCamera[]>>((acc, cam) => {
    ;(acc[cam.zone] ??= []).push(cam)
    return acc
  }, {})
  const zoneKeys = Object.keys(grouped).sort()

  // Displayed cameras: selected IDs that still exist
  const displayedCams = selectedIds
    .map(id => MOCK_CAMERAS.find(c => c.id === id))
    .filter((c): c is TrainingCamera => !!c)
  const safeCams = displayedCams.length > 0 ? displayedCams : [defaultCam]

  const handleThumbClick = (cam: TrainingCamera) => {
    setSelectedIds(prev => {
      if (prev.includes(cam.id)) {
        // Deselect — keep at least 1
        return prev.length > 1 ? prev.filter(id => id !== cam.id) : prev
      }
      // Select — unlimited
      return [...prev, cam.id]
    })
    onSelectCamera?.(cam)
  }

  return (
    <>
      <div className="flex h-full">
        {/* ── Left: camera grid ── */}
        <div className="flex-1 min-w-0 p-2.5">
          <CameraGrid cams={safeCams} onMaximize={cam => setFocusedCam(cam)} />
        </div>

        {/* ── Right: collapsible sidebar ── */}
        <div className={cn(
          'shrink-0 flex flex-col border-l border-[#1e2433] transition-all duration-200 overflow-hidden',
          sidebarOpen ? 'w-1/4' : 'w-8',
        )}>
          {sidebarOpen ? (
            <>
              {/* Zone tabs + collapse button */}
              <div className="flex items-center gap-1 px-2 py-2 border-b border-[#1e2433] shrink-0">
                {ZONE_TABS.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setZoneTab(tab)}
                    className={cn(
                      'flex-1 px-1.5 py-1 text-[9px] font-semibold rounded transition-colors',
                      zoneTab === tab
                        ? 'bg-primary/20 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-[#1a2235]',
                    )}
                  >
                    {tab}
                  </button>
                ))}
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="ml-1 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-[#1a2235] transition-colors shrink-0"
                  title="Thu gọn"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>

              {/* Camera count + select hint */}
              {selectedIds.length > 1 && (
                <div className="px-2.5 py-1 border-b border-[#1e2433] shrink-0 flex items-center justify-between">
                  <span className="text-[8px] text-muted-foreground/60">
                    Đang xem <span className="text-primary font-semibold">{selectedIds.length}</span> camera
                    {selectedIds.length > 9 && <span className="text-yellow-400/70"> · {Math.ceil(Math.sqrt(selectedIds.length))}×{Math.ceil(Math.sqrt(selectedIds.length))} lưới</span>}
                  </span>
                  <button
                    onClick={() => setSelectedIds([defaultCam.id])}
                    className="text-[8px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  >
                    Đặt lại
                  </button>
                </div>
              )}

              {/* Scrollable thumbnail grid */}
              <div className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2">
                <div className="flex flex-col gap-2.5">
                  {zoneKeys.map(zone => (
                    <div key={zone}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-[8.5px] font-bold text-muted-foreground/70 uppercase tracking-widest whitespace-nowrap">
                          {zone}
                        </span>
                        <div className="flex-1 h-px bg-[#1e2433]" />
                        <span className="text-[8px] text-muted-foreground/40 shrink-0">
                          {grouped[zone].length} cam
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {grouped[zone].map(cam => (
                          <CameraThumb
                            key={cam.id}
                            cam={cam}
                            selected={selectedIds.includes(cam.id)}
                            onClick={() => handleThumbClick(cam)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* Collapsed strip — just a toggle button */
            <div className="flex flex-col items-center justify-center h-full">
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
