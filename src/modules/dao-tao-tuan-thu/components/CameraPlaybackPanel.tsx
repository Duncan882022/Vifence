import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Play, Pause, Volume2, VolumeX, RefreshCw, Tag, Info,
  Calendar, Video, Loader2, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import dayjs from 'dayjs'
import { MEDIA_BASE_URL } from '@/config'
import type { CameraWithWorker } from '../hooks/useCameras'
import {
  fetchCameraRecords,
  fetchDetectedObjects,
  type CameraRecordItem,
  type DetectedObjectItem,
} from '@/api/camera.api'
import { TRAINING_LIST_STATE_TEXT, TRAINING_LIST_STATE_WRAP } from './trainingListStates'
import { CCTV_SCANLINE, TrainingCameraShell, CameraThumb } from './TrainingCameraShell'
import { useShellLayout } from '@/hooks/useShellLayout'
import {
  CAMERA_LOCATION_ALL,
  getCameraLocationTabs,
  groupCamerasByLocation,
} from '../services/cameraFilter.service'

type RecordModel = CameraRecordItem
type DetectedObjectModel = DetectedObjectItem

export interface CameraPlaybackPanelProps {
  cameras: CameraWithWorker[]
  selectedCameraId?: string
  onSelectCamera?: (cam: CameraWithWorker) => void
}

function PlaybackDatePicker({
  date,
  onDateChange,
  maxDate = dayjs().format('YYYY-MM-DD'),
  compact = false,
}: {
  date: string
  onDateChange: (date: string) => void
  maxDate?: string
  compact?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const parsed = dayjs(date)
  const formatted = parsed.format('DD/MM/YYYY')
  const isToday = date === maxDate

  const shift = (days: number) => {
    const next = parsed.add(days, 'day')
    if (next.isAfter(dayjs(maxDate), 'day')) return
    onDateChange(next.format('YYYY-MM-DD'))
  }

  const openPicker = () => {
    const input = inputRef.current
    if (!input) return
    if (typeof input.showPicker === 'function') input.showPicker()
    else input.click()
  }

  return (
    <div className={cn(
      compact
        ? 'flex items-center gap-1 shrink-0'
        : 'flex items-center justify-between gap-2 flex-wrap',
    )}>
      {!compact && (
        <span className="text-[8px] font-semibold text-muted-foreground/70 uppercase tracking-wider shrink-0">
          Ngày xem lại
        </span>
      )}
      <div className={cn('flex items-center min-w-0', compact ? 'gap-1' : 'gap-1.5')}>
        <div className="flex items-center rounded-md border border-[#1e2433] bg-[#0b0f1a] p-0.5">
          <button
            type="button"
            aria-label="Ngày trước"
            onClick={() => shift(-1)}
            className={cn(
              'rounded hover:bg-[#1a2235] text-muted-foreground hover:text-foreground transition-colors',
              compact ? 'p-1' : 'p-1.5',
            )}
          >
            <ChevronLeft className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          </button>

          <button
            type="button"
            onClick={openPicker}
            className={cn(
              'relative flex items-center rounded font-semibold text-amber-400 hover:bg-[#1a2235] tabular-nums transition-colors justify-center',
              compact
                ? 'gap-1 px-1.5 py-1 text-[10px] min-w-[88px]'
                : 'gap-1.5 px-2.5 py-1.5 text-[11px] min-w-[104px]',
            )}
          >
            <Calendar className={cn('shrink-0 opacity-80', compact ? 'w-3 h-3' : 'w-3.5 h-3.5')} />
            {formatted}
            <input
              ref={inputRef}
              type="date"
              value={date}
              max={maxDate}
              onChange={e => {
                if (e.target.value) onDateChange(e.target.value)
              }}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer [color-scheme:dark]"
              aria-label="Chọn ngày"
            />
          </button>

          <button
            type="button"
            aria-label="Ngày sau"
            disabled={isToday}
            onClick={() => shift(1)}
            className={cn(
              'rounded hover:bg-[#1a2235] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none',
              compact ? 'p-1' : 'p-1.5',
            )}
          >
            <ChevronRight className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          </button>
        </div>

        {!isToday && (
          <button
            type="button"
            onClick={() => onDateChange(maxDate)}
            className={cn(
              'shrink-0 font-semibold rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/25 hover:bg-amber-500/15 transition-colors',
              compact ? 'text-[8px] px-1.5 py-1' : 'text-[9px] px-2.5 py-1.5',
            )}
          >
            Hôm nay
          </button>
        )}
      </div>
    </div>
  )
}

function PlaybackCell({
  cam,
  videoSrc,
  loadingRecords,
  selectedRecord,
  videoRef,
  muted,
}: {
  cam: CameraWithWorker
  videoSrc: string | null
  loadingRecords: boolean
  selectedRecord: RecordModel | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  muted: boolean
}) {
  return (
    <div className="relative w-full h-full min-h-[120px] overflow-hidden rounded-lg bg-[#060b14] border border-[#1e2433]">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f1922] via-[#0a1219] to-[#060d14]" />

      {videoSrc ? (
        <video
          ref={videoRef}
          src={videoSrc}
          className="absolute inset-0 w-full h-full object-contain z-[1]"
          muted={muted}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground/40 z-[1]">
          <Video className="w-8 h-8" />
          <span className="text-[9px]">
            {loadingRecords ? 'Đang tải bản ghi...' : 'Không có bản ghi trong ngày này'}
          </span>
        </div>
      )}

      <div className="absolute inset-0 opacity-[0.03] pointer-events-none z-[2]" style={CCTV_SCANLINE} />

      <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-1 z-20">
        {selectedRecord && (
          <div className="min-w-0 bg-black/60 rounded px-2 py-1 border border-[#1e2433]">
            <p className="text-[8px] text-white/90 font-semibold truncate">{selectedRecord.name}</p>
            <p className="text-[7px] text-white/45 tabular-nums">
              {dayjs(selectedRecord.startTime).format('HH:mm:ss')} – {dayjs(selectedRecord.endTime).format('HH:mm:ss')}
            </p>
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent z-20 px-3 pt-10 pb-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-white tracking-wide truncate text-[13px]">
            {cam.name}
          </span>
          {cam.address && (
            <span className="shrink-0 bg-blue-500/25 border border-blue-500/40 text-blue-200 rounded-full font-medium text-[9px] px-2.5 py-0.5">
              {cam.address}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function TimelineBar({
  records,
  selectedRecord,
  onSelectRecord,
  compact = false,
}: {
  records: RecordModel[]
  selectedRecord: RecordModel | null
  onSelectRecord: (record: RecordModel, seekSeconds?: number) => void
  compact?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hourWidth, setHourWidth] = useState(48)
  const totalWidth = 24 * hourWidth
  const now = dayjs()

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault()
        const delta = -e.deltaY * 0.3
        setHourWidth(prev => Math.min(Math.max(prev + delta, 24), 400))
      }
    }
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [])

  const getPosition = (isoTime: string) => {
    const t = dayjs(isoTime)
    const seconds = t.hour() * 3600 + t.minute() * 60 + t.second()
    return (seconds / 86400) * totalWidth
  }

  const getWidth = (record: RecordModel) => {
    const start = dayjs(record.startTime)
    const end = dayjs(record.endTime)
    const startSec = start.hour() * 3600 + start.minute() * 60 + start.second()
    const endSec = end.hour() * 3600 + end.minute() * 60 + end.second()
    return Math.max(3, ((endSec - startSec) / 86400) * totalWidth)
  }

  const currentSec = now.hour() * 3600 + now.minute() * 60 + now.second()
  const pointerPos = (currentSec / 86400) * totalWidth
  const continuousRecords = records.filter(r => r.type === 'continuous' || r.type === 'continuous_event')
  const eventRecords = records.filter(r => r.type === 'event')
  const hours = Array.from({ length: 25 }, (_, i) => `${i < 10 ? '0' : ''}${i}:00`)

  return (
    <div className={cn(
      'rounded-lg border border-[#1e2433] bg-[#060b14] relative overflow-hidden shrink-0',
      compact ? 'h-14' : 'h-20',
    )}>
      <div
        ref={containerRef}
        className={cn(
          'absolute inset-0 overflow-x-auto',
          compact ? 'px-3 pt-2' : 'px-4 pt-4',
        )}
        style={{ scrollbarWidth: 'none' }}
      >
        <div className="relative h-full" style={{ width: `${totalWidth}px` }}>
          <div className="absolute inset-x-0 bottom-3 h-3">
            {hours.map((hour, i) => (
              <div key={i} className="absolute bottom-0 flex flex-col items-center" style={{ left: `${i * hourWidth}px` }}>
                <div className="h-2 w-px bg-white/20" />
                <span className="absolute top-2.5 -translate-x-1/2 text-[7px] text-white/25 font-medium select-none whitespace-nowrap">
                  {hour}
                </span>
              </div>
            ))}
          </div>

          <div className="absolute bottom-1 left-0 right-0 h-6 flex items-center">
            {continuousRecords.map(record => (
              <div
                key={record.id}
                title={`${record.name} | ${dayjs(record.startTime).format('HH:mm')} — ${dayjs(record.endTime).format('HH:mm')}`}
                className="absolute h-6 flex items-center cursor-pointer group"
                style={{ left: `${getPosition(record.startTime)}px`, width: `${getWidth(record)}px` }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const clickX = e.clientX - rect.left
                  const percentage = clickX / rect.width
                  const start = dayjs(record.startTime)
                  const end = dayjs(record.endTime)
                  const totalSeconds = end.diff(start, 'second')
                  const seekSecs = Math.floor(percentage * totalSeconds)
                  onSelectRecord(record, seekSecs)
                }}
              >
                <div
                  className={cn(
                    'w-full h-1.5 rounded-sm transition-all',
                    selectedRecord?.id === record.id
                      ? 'bg-primary opacity-100'
                      : 'bg-primary/35 group-hover:bg-primary/55',
                  )}
                />
              </div>
            ))}
          </div>

          <div className="absolute inset-0 pointer-events-none">
            {eventRecords.map(record => {
              const position = getPosition(record.startTime)
              const thumbnailSrc = record.thumbnailId
                ? `${MEDIA_BASE_URL}/ai-data/${record.thumbnailId}`
                : null
              return (
                <div
                  key={record.id}
                  className="absolute top-0 flex flex-col items-start group cursor-pointer z-20 pointer-events-auto"
                  style={{ left: `${position}px` }}
                  onClick={() => {
                    const parent = continuousRecords.find(c => {
                      const et = dayjs(record.startTime)
                      return et.isAfter(dayjs(c.startTime)) && et.isBefore(dayjs(c.endTime))
                    })
                    if (parent) {
                      const seek = dayjs(record.startTime).diff(dayjs(parent.startTime), 'second')
                      onSelectRecord(parent, seek)
                    } else {
                      onSelectRecord(record, 0)
                    }
                  }}
                >
                  {thumbnailSrc ? (
                    <img src={thumbnailSrc} className="aspect-video w-10 rounded-sm border border-primary/30 shadow" alt="" />
                  ) : (
                    <div className="aspect-video w-10 bg-[#1a2235] rounded-sm flex items-center justify-center">
                      <Video className="w-2.5 h-2.5 text-white/20" />
                    </div>
                  )}
                  <div className="w-px h-6 bg-primary/30 group-hover:bg-primary/60 transition-opacity" />
                </div>
              )
            })}
          </div>

          <div
            className="absolute top-0 bottom-3 w-px bg-red-500 z-30 pointer-events-none"
            style={{ left: `${pointerPos}px` }}
          >
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full -ml-[2px]" />
          </div>
        </div>
      </div>
    </div>
  )
}

function PlaybackTransportBar({
  date,
  onDateChange,
  progress,
  onScrub,
  isPlaying,
  onTogglePlay,
  videoSrc,
  currentTime,
  duration,
  formatTime,
  muted,
  onToggleMute,
  volume,
  onVolumeChange,
}: {
  date: string
  onDateChange: (date: string) => void
  progress: number
  onScrub: (pct: number) => void
  isPlaying: boolean
  onTogglePlay: () => void
  videoSrc: string | null
  currentTime: number
  duration: number
  formatTime: (secs: number) => string
  muted: boolean
  onToggleMute: () => void
  volume: number
  onVolumeChange: (value: number) => void
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-[#1e2433] bg-[#060b14] shrink-0 min-h-[44px]">
      <PlaybackDatePicker date={date} onDateChange={onDateChange} compact />

      <button
        type="button"
        onClick={onTogglePlay}
        disabled={!videoSrc}
        className="w-7 h-7 rounded-full bg-primary hover:bg-primary/80 disabled:opacity-30 flex items-center justify-center transition-colors shrink-0"
      >
        {isPlaying ? <Pause className="w-3.5 h-3.5 text-white" /> : <Play className="w-3.5 h-3.5 text-white ml-px" />}
      </button>

      <span className="text-[9px] text-muted-foreground tabular-nums whitespace-nowrap shrink-0 w-[72px]">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <div
        className="relative flex-1 min-w-[80px] h-1 bg-[#1a2235] rounded-full cursor-pointer group"
        onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          onScrub(((e.clientX - rect.left) / rect.width) * 100)
        }}
      >
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-primary shadow opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `calc(${progress}% - 5px)` }}
        />
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onToggleMute}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={e => onVolumeChange(Number(e.target.value))}
          className="w-16 h-1 accent-primary cursor-pointer"
        />
      </div>
    </div>
  )
}

function DetectionsSidebar({
  detections,
  loading,
  embedded = false,
}: {
  detections: DetectedObjectModel[]
  loading: boolean
  embedded?: boolean
}) {
  return (
    <div className={cn(!embedded && 'pt-2 border-t border-[#1e2433]')}>
      {!embedded && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[8px] lg:text-[9px] font-bold text-muted-foreground/70 uppercase tracking-widest whitespace-nowrap">
            AI Detected ({detections.length})
          </span>
          <div className="flex-1 h-px bg-[#1e2433]" />
          {loading && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground/40" />}
        </div>
      )}
      {detections.length === 0 ? (
        <p className="text-[9px] text-muted-foreground/45 italic py-2 flex items-center gap-1.5">
          Không có đối tượng nhận diện
          {loading && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground/40" />}
        </p>
      ) : (
        <div className={cn(
          'space-y-1.5 overflow-y-auto',
          embedded ? 'max-h-[min(28vh,200px)]' : 'max-h-[140px]',
        )}>
          {detections.map(item => (
            <div
              key={item.id}
              className="p-2 rounded border border-[#1e2433] bg-[#0d1117]/80 hover:border-primary/25 transition-colors"
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <div className="flex items-center gap-1 min-w-0">
                  <Tag className="w-2.5 h-2.5 text-primary shrink-0" />
                  <span className="text-[8px] font-bold text-foreground/90 uppercase truncate">{item.label}</span>
                </div>
                <span className="text-[7px] font-bold text-green-400 bg-green-500/10 px-1 py-px rounded shrink-0">
                  {item.confidenceScore}%
                </span>
              </div>
              {item.detectionResult && (
                <div className="flex items-start gap-1">
                  <Info className="w-2 h-2 text-muted-foreground/40 mt-0.5 shrink-0" />
                  <p className="text-[7px] text-muted-foreground/60 line-clamp-2">{item.detectionResult}</p>
                </div>
              )}
              <p className="text-[7px] text-muted-foreground/35 mt-1 tabular-nums">
                {dayjs(item.createdAt).format('HH:mm:ss')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PlaybackContextTabs({
  cameras,
  selectedIds,
  onThumbClick,
  detections,
  loadingDetections,
  sidebarGroups,
  locationFilterTabs,
  locationTab,
  onLocationTabChange,
}: {
  cameras: CameraWithWorker[]
  selectedIds: string[]
  onThumbClick: (cam: CameraWithWorker) => void
  detections: DetectedObjectModel[]
  loadingDetections: boolean
  sidebarGroups: { key: string; cameras: CameraWithWorker[] }[]
  locationFilterTabs?: string[]
  locationTab: string
  onLocationTabChange: (tab: string) => void
}) {
  const [tab, setTab] = useState<'camera' | 'ai'>('camera')
  const hasLocationFilters = !!locationFilterTabs?.length

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
            {hasLocationFilters && (
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0 mb-2 pb-1 border-b border-[#1e2433]">
                {locationFilterTabs!.map(filterTab => (
                  <button
                    key={filterTab}
                    type="button"
                    onClick={() => onLocationTabChange(filterTab)}
                    className={cn(
                      'px-1.5 py-0.5 text-[8px] font-semibold rounded whitespace-nowrap transition-colors shrink-0',
                      locationTab === filterTab
                        ? 'bg-primary/20 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-[#1a2235]',
                    )}
                  >
                    {filterTab}
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
                      <span className="text-[8px] text-muted-foreground/40 shrink-0">
                        {groupCams.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 max-[360px]:grid-cols-2 gap-1 min-w-0 overflow-x-hidden">
                      {groupCams.map(cam => (
                        <CameraThumb
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
          <DetectionsSidebar detections={detections} loading={loadingDetections} embedded />
        )}
      </div>
    </div>
  )
}

export function CameraPlaybackPanel({
  cameras,
  selectedCameraId,
  onSelectCamera,
}: CameraPlaybackPanelProps) {
  const resolveCamera = useCallback(
    (id?: string) => cameras.find(c => c.id === id) ?? cameras[0] ?? null,
    [cameras],
  )

  const [selectedCam, setSelectedCam] = useState<CameraWithWorker | null>(() => resolveCamera(selectedCameraId))
  const [locationTab, setLocationTab] = useState(CAMERA_LOCATION_ALL)
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [records, setRecords] = useState<RecordModel[]>([])
  const [selectedRecord, setSelectedRecord] = useState<RecordModel | null>(null)
  const [detections, setDetections] = useState<DetectedObjectModel[]>([])
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [loadingDetections, setLoadingDetections] = useState(false)
  const [seekSeconds, setSeekSeconds] = useState(0)

  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [volume, setVolume] = useState(80)
  const [muted, setMuted] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)

  const { isDesktop } = useShellLayout()
  const showInlineContext = !isDesktop
  const hideMobileSidebar = !isDesktop

  const selectedIds = selectedCam ? [selectedCam.id] : []

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
    const cam = resolveCamera(selectedCameraId)
    if (cam) setSelectedCam(cam)
  }, [selectedCameraId, resolveCamera])

  useEffect(() => {
    if (!selectedCam) return
    setLoadingRecords(true)
    setRecords([])
    setSelectedRecord(null)
    const start = dayjs(date).startOf('day').toISOString()
    const end = dayjs(date).endOf('day').toISOString()
    fetchCameraRecords(selectedCam.id, { startDate: start, endDate: end })
      .then(res => {
        const items = res.items || []
        setRecords(items)
        if (items.length > 0) setSelectedRecord(items[0])
      })
      .catch(err => console.error('Error loading records:', err))
      .finally(() => setLoadingRecords(false))
  }, [selectedCam, date])

  useEffect(() => {
    if (!selectedRecord?.id) { setDetections([]); return }
    setLoadingDetections(true)
    fetchDetectedObjects(selectedRecord.id)
      .then(res => setDetections(res.items || []))
      .catch(() => setDetections([]))
      .finally(() => setLoadingDetections(false))
  }, [selectedRecord])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !selectedRecord?.videoId) return
    const handleCanPlay = () => {
      video.currentTime = seekSeconds
      video.play().then(() => setIsPlaying(true)).catch(() => {})
    }
    video.addEventListener('canplay', handleCanPlay, { once: true })
    return () => video.removeEventListener('canplay', handleCanPlay)
  }, [selectedRecord, seekSeconds])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onTime = () => {
      setCurrentTime(video.currentTime)
      if (video.duration) setProgress((video.currentTime / video.duration) * 100)
    }
    const onDur = () => setDuration(video.duration)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('durationchange', onDur)
    return () => { video.removeEventListener('timeupdate', onTime); video.removeEventListener('durationchange', onDur) }
  }, [selectedRecord])

  const handleSelectCamera = (cam: CameraWithWorker) => {
    setSelectedCam(cam)
    onSelectCamera?.(cam)
  }

  const handleSelectRecord = useCallback((record: RecordModel, seek = 0) => {
    setSelectedRecord(record)
    setSeekSeconds(seek)
    setProgress(0)
    setCurrentTime(0)
  }, [])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) { video.pause(); setIsPlaying(false) }
    else { video.play().then(() => setIsPlaying(true)).catch(console.error) }
  }

  const handleScrub = (pct: number) => {
    const video = videoRef.current
    if (!video || !duration) return
    video.currentTime = (pct / 100) * duration
    setCurrentTime(video.currentTime)
    setProgress(pct)
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const videoSrc = selectedRecord?.videoId
    ? `${MEDIA_BASE_URL}/ai-data/${selectedRecord.videoId}`
    : null

  if (cameras.length === 0) {
    return (
      <div className={cn(TRAINING_LIST_STATE_WRAP, 'h-full')}>
        <p className={TRAINING_LIST_STATE_TEXT}>Chưa có camera nào được cấu hình</p>
      </div>
    )
  }

  if (!selectedCam) {
    return (
      <div className={cn(TRAINING_LIST_STATE_WRAP, 'h-full')}>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/60" />
      </div>
    )
  }

  return (
    <TrainingCameraShell
      cameras={cameras}
      selectedIds={selectedIds}
      onThumbClick={handleSelectCamera}
      thumbVariant="playback"
      sidebarTabbed
      hideStackedPortraitSidebar={hideMobileSidebar}
      hideLandscapeMobileStrip
      locationFilterTabs={locationFilterTabs.length > 1 ? locationFilterTabs : undefined}
      activeLocationTab={locationTab}
      onLocationTabChange={setLocationTab}
      sidebarGroups={sidebarGroups}
      sidebarSummary={(
        <>
          <span className="text-primary font-semibold">1</span> bản ghi
        </>
      )}
      sidebarFooter={(
        <DetectionsSidebar detections={detections} loading={loadingDetections} embedded />
      )}
    >
      <div className={cn(
        'flex flex-col w-full min-h-0',
        isDesktop ? 'h-full flex-1 gap-1' : 'gap-1.5 h-auto',
      )}>
        <div className={cn(
          'relative w-full min-h-0',
          isDesktop ? 'flex-[1_1_70%] min-h-[200px]' : 'aspect-video shrink-0',
        )}>
          <PlaybackCell
            cam={selectedCam}
            videoSrc={videoSrc}
            loadingRecords={loadingRecords}
            selectedRecord={selectedRecord}
            videoRef={videoRef}
            muted={muted}
          />
        </div>

        {showInlineContext && (
          <PlaybackContextTabs
            cameras={cameras}
            selectedIds={selectedIds}
            onThumbClick={handleSelectCamera}
            detections={detections}
            loadingDetections={loadingDetections}
            sidebarGroups={sidebarGroups}
            locationFilterTabs={locationFilterTabs.length > 1 ? locationFilterTabs : undefined}
            locationTab={locationTab}
            onLocationTabChange={setLocationTab}
          />
        )}

        {isDesktop ? (
          <div className="shrink-0 flex flex-col gap-1 pt-0.5 border-t border-[#1e2433]/50">
            <TimelineBar
              compact
              records={records}
              selectedRecord={selectedRecord}
              onSelectRecord={handleSelectRecord}
            />
            <PlaybackTransportBar
              date={date}
              onDateChange={setDate}
              progress={progress}
              onScrub={handleScrub}
              isPlaying={isPlaying}
              onTogglePlay={togglePlay}
              videoSrc={videoSrc}
              currentTime={currentTime}
              duration={duration}
              formatTime={formatTime}
              muted={muted}
              onToggleMute={() => {
                setMuted(m => !m)
                if (videoRef.current) videoRef.current.muted = !muted
              }}
              volume={volume}
              onVolumeChange={v => {
                setVolume(v)
                if (videoRef.current) videoRef.current.volume = v / 100
              }}
            />
          </div>
        ) : (
          <>
            <TimelineBar
              records={records}
              selectedRecord={selectedRecord}
              onSelectRecord={handleSelectRecord}
            />

            <div className="rounded-lg border border-[#1e2433] bg-[#060b14] px-3 py-2 shrink-0 space-y-2">
              <PlaybackDatePicker date={date} onDateChange={setDate} />
              <div
                className="relative w-full h-1 bg-[#1a2235] rounded-full cursor-pointer group"
                onClick={e => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  handleScrub(((e.clientX - rect.left) / rect.width) * 100)
                }}
              >
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-primary shadow opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `calc(${progress}% - 5px)` }}
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={togglePlay}
                    disabled={!videoSrc}
                    className="w-6 h-6 rounded-full bg-primary hover:bg-primary/80 disabled:opacity-30 flex items-center justify-center transition-colors"
                  >
                    {isPlaying ? <Pause className="w-3 h-3 text-white" /> : <Play className="w-3 h-3 text-white ml-px" />}
                  </button>
                  <span className="text-[9px] text-muted-foreground tabular-nums">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMuted(m => !m)
                      if (videoRef.current) videoRef.current.muted = !muted
                    }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={volume}
                    onChange={e => {
                      const v = Number(e.target.value)
                      setVolume(v)
                      if (videoRef.current) videoRef.current.volume = v / 100
                    }}
                    className="w-14 h-1 accent-primary cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </TrainingCameraShell>
  )
}
