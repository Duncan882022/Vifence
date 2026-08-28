import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useShellLayout } from '@/hooks/useShellLayout'
import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import type {
  CameraDetection,
  CameraPlaybackRecord,
  CameraDetectionsResponse,
  CameraPlaybackRecordsResponse,
} from '@/types/cameraPlayback'
import {
  ALL_LOCATIONS_TAB,
  formatPlaybackClock,
  getLocationFilterTabs,
  groupCamerasByLocation,
  resolvePlaybackVideoUrl,
} from '@/utils/cameraPlaybackUi'
import {
  fetchCameraRecords,
  fetchRecordDetections,
  getDefaultPlaybackDate,
} from '@/services/cameraPlayback.service'
import { CameraPanelShell } from './CameraPanelShell'
import { PlaybackVideoFrame } from './PlaybackVideoFrame'
import { PlaybackRecordTimeline } from './PlaybackRecordTimeline'
import { PlaybackControlBar, PlaybackMobileControls } from './PlaybackControlBar'
import { PlaybackDetectionsList } from './PlaybackDetectionsList'
import { PlaybackMobileStrip } from './PlaybackMobileStrip'
import { useEventClipPlayback } from '@/modules/module03-safety/components/EventPlaybackViewport'
import { buildEventClipWindow, EVENT_PLAYBACK_CLIP_SEC } from '@/modules/module03-safety/utils/eventPlaybackClip'
import { SafetyEventDetailContent } from '@/modules/module03-safety/components/SafetyEventDetailContent'
import type { SafetyViolationRecord } from '@/modules/module03-safety/types/safety.types'

export type PlaybackPreferRecordType = 'event' | 'continuous'

function pickDefaultPlaybackRecord(
  items: CameraPlaybackRecord[],
  prefer: PlaybackPreferRecordType,
): CameraPlaybackRecord | null {
  if (items.length === 0) return null
  if (prefer === 'continuous') {
    return items.find(item => item.type === 'continuous' || item.type === 'continuous_event') ?? items[0]
  }
  return items.find(item => item.type === 'event') ?? items[0]
}

export interface CameraPlaybackPanelProps {
  cameras: TrainingCamera[]
  selectedCameraId?: string
  onSelectCamera?: (cam: TrainingCamera) => void
  defaultDate?: string
  maxDate?: string
  minDate?: string
  onDateChange?: (date: string) => void
  initialRecordId?: string
  /** Đồng bộ bản ghi đang chọn từ danh sách sự kiện (tier ATLĐ). */
  selectedRecordId?: string | null
  /** Metadata sự kiện — hiển thị dưới video khi đang phát clip vi phạm. */
  activeEventRecord?: SafetyViolationRecord | null
  /** Cùng filter sidebar với TrainingCameraPanel — nếu không truyền thì fallback theo location */
  filterTabs?: string[]
  filterFn?: (tab: string) => TrainingCamera[]
  groupFn?: (cameras: TrainingCamera[], tab: string) => { key: string; cameras: TrainingCamera[] }[]
  fetchRecords?: (
    cameraId: string,
    params: { startDate: string; endDate: string },
  ) => Promise<CameraPlaybackRecordsResponse>
  fetchDetections?: (recordId: string) => Promise<CameraDetectionsResponse>
  /** % chiều cao vùng video desktop (mặc định 70). Module 03 ATLĐ: ~82. */
  videoAreaFlex?: number
  /** Module 05 tuần tra: ưu tiên băng liên tục MediaMTX (event clip hay 404 nếu lệch giây). */
  preferRecordType?: PlaybackPreferRecordType
  /** Bấm block timeline — dùng để bỏ sync sự kiện từ panel ngoài. */
  onSelectRecord?: (record: CameraPlaybackRecord) => void
}

export function CameraPlaybackPanel({
  cameras,
  selectedCameraId,
  onSelectCamera,
  defaultDate,
  maxDate,
  minDate,
  onDateChange,
  initialRecordId,
  selectedRecordId,
  activeEventRecord,
  filterTabs,
  filterFn,
  groupFn,
  fetchRecords = fetchCameraRecords,
  fetchDetections = fetchRecordDetections,
  videoAreaFlex = 70,
  preferRecordType = 'event',
  onSelectRecord,
}: CameraPlaybackPanelProps) {
  const resolveCamera = useCallback(
    (id?: string) => cameras.find(cam => cam.id === id) ?? cameras[0] ?? null,
    [cameras],
  )

  const [activeCam, setActiveCam] = useState<TrainingCamera | null>(() => resolveCamera(selectedCameraId))
  const usesCustomSidebar = Boolean(filterTabs?.length && filterFn && groupFn)
  const defaultSidebarTab = filterTabs?.[0] ?? ALL_LOCATIONS_TAB
  const [sidebarTab, setSidebarTab] = useState(defaultSidebarTab)
  const [date, setDate] = useState(defaultDate ?? getDefaultPlaybackDate())

  useEffect(() => {
    if (defaultDate) setDate(defaultDate)
  }, [defaultDate])

  const handleDateChange = useCallback((next: string) => {
    setDate(next)
    onDateChange?.(next)
  }, [onDateChange])
  const [records, setRecords] = useState<CameraPlaybackRecord[]>([])
  const [selectedRecord, setSelectedRecord] = useState<CameraPlaybackRecord | null>(null)
  const [detections, setDetections] = useState<CameraDetection[]>([])
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [loadingDetections, setLoadingDetections] = useState(false)
  const [seekSec, setSeekSec] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolume] = useState(80)
  const [muted, setMuted] = useState(true)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const fetchRecordsRef = useRef(fetchRecords)
  const selectedRecordIdRef = useRef(selectedRecordId)
  const initialRecordIdRef = useRef(initialRecordId)
  const selectedRecordRef = useRef(selectedRecord)
  const seekSecRef = useRef(seekSec)
  fetchRecordsRef.current = fetchRecords
  selectedRecordIdRef.current = selectedRecordId
  initialRecordIdRef.current = initialRecordId
  selectedRecordRef.current = selectedRecord
  seekSecRef.current = seekSec
  const { isDesktop } = useShellLayout()
  const isMobile = !isDesktop

  const sidebarFilterTabs = useMemo(
    () => (usesCustomSidebar ? filterTabs! : getLocationFilterTabs(cameras)),
    [usesCustomSidebar, filterTabs, cameras],
  )

  const sidebarGroups = useMemo(() => {
    if (usesCustomSidebar) {
      const filtered = filterFn!(sidebarTab)
      return groupFn!(filtered, sidebarTab)
    }
    return groupCamerasByLocation(cameras, sidebarTab)
  }, [usesCustomSidebar, filterFn, groupFn, cameras, sidebarTab])

  useEffect(() => {
    if (!sidebarFilterTabs.includes(sidebarTab)) {
      setSidebarTab(sidebarFilterTabs[0] ?? ALL_LOCATIONS_TAB)
    }
  }, [sidebarFilterTabs, sidebarTab])

  useEffect(() => {
    const cam = resolveCamera(selectedCameraId)
    if (cam) setActiveCam(cam)
  }, [selectedCameraId, resolveCamera])

  useEffect(() => {
    if (!activeCam) return
    let cancelled = false
    setLoadingRecords(true)
    setRecords([])
    setSelectedRecord(null)

    // Luôn dùng biên ngày lịch VN (+07) — không phụ thuộc múi giờ trình duyệt.
    const startDate = `${date}T00:00:00+07:00`
    const endDate = `${date}T23:59:59.999+07:00`

    fetchRecordsRef.current(activeCam.id, { startDate, endDate })
      .then(res => {
        if (cancelled) return
        const items = res.items ?? []
        setRecords(items)

        const syncId = selectedRecordIdRef.current
        const initId = initialRecordIdRef.current
        const fromEventPanel = syncId
          ? items.find(item => item.id === syncId)
          : undefined
        const fromInitial = initId
          ? items.find(item => item.id === initId)
          : undefined
        const keepCurrent = selectedRecordRef.current
          ? items.find(item => item.id === selectedRecordRef.current!.id)
          : undefined
        const next = fromEventPanel
          ?? fromInitial
          ?? keepCurrent
          ?? pickDefaultPlaybackRecord(items, preferRecordType)

        if (next) {
          const sameId = selectedRecordRef.current?.id === next.id
          setSelectedRecord(next)
          setSeekSec(sameId ? seekSecRef.current : (next.seekSec ?? 0))
          if (!sameId) {
            setProgress(0)
            setCurrentTime(0)
            setIsPlaying(false)
          }
          setPlaybackError(null)
        } else {
          setSelectedRecord(null)
        }
      })
      .catch(err => console.error('Error loading records:', err))
      .finally(() => {
        if (!cancelled) setLoadingRecords(false)
      })

    return () => { cancelled = true }
  }, [activeCam?.id, date, preferRecordType])

  useEffect(() => {
    if (!selectedRecordId) return
    const match = records.find(item => item.id === selectedRecordId)
    if (!match) return
    setSelectedRecord(match)
    setSeekSec(match.seekSec ?? 0)
    setProgress(0)
    setCurrentTime(0)
    setIsPlaying(false)
    setPlaybackError(null)
  }, [selectedRecordId, records])

  useEffect(() => {
    if (!selectedRecord?.id) {
      setDetections([])
      return
    }
    let cancelled = false
    setLoadingDetections(true)
    fetchDetections(selectedRecord.id)
      .then(res => {
        if (!cancelled) setDetections(res.items ?? [])
      })
      .catch(() => {
        if (!cancelled) setDetections([])
      })
      .finally(() => {
        if (!cancelled) setLoadingDetections(false)
      })
  }, [selectedRecord?.id, fetchDetections])

  const videoSrc = resolvePlaybackVideoUrl(selectedRecord)
  const isEventClip = selectedRecord?.type === 'event'
  const eventSeekSec = selectedRecord?.seekSec ?? 0
  const eventClipSec = selectedRecord?.clipDurationSec ?? EVENT_PLAYBACK_CLIP_SEC

  useEventClipPlayback(videoRef, {
    enabled: isEventClip && Boolean(videoSrc),
    videoSrc,
    seekSec: eventSeekSec,
    clipDurationSec: eventClipSec,
    autoPlay: true,
    onClipProgress: (current, clipDur) => {
      setDuration(clipDur)
      setCurrentTime(current)
      setProgress(clipDur > 0 ? (current / clipDur) * 100 : 0)
      setIsPlaying(true)
    },
  })

  useEffect(() => {
    const video = videoRef.current
    if (!video || !videoSrc || isEventClip) return

    let cancelled = false
    setPlaybackError(null)

    const startPlayback = () => {
      if (cancelled) return
      video.muted = muted || volume === 0
      try {
        video.currentTime = Math.max(0, seekSec)
      } catch {
        /* seek trước khi metadata sẵn sàng */
      }
      void video.play()
        .then(() => { if (!cancelled) setIsPlaying(true) })
        .catch(() => { if (!cancelled) setIsPlaying(false) })
    }

    const onCanPlay = () => startPlayback()
    const onLoadedMetadata = () => {
      if (video.duration && Number.isFinite(video.duration)) {
        setDuration(video.duration)
      }
    }
    const onError = () => {
      if (cancelled) return
      setIsPlaying(false)
      setPlaybackError('Không tải được video — thử chọn đoạn băng liên tục trên timeline')
    }

    video.addEventListener('canplay', onCanPlay, { once: true })
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('error', onError)

    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      startPlayback()
    } else {
      video.load()
    }

    return () => {
      cancelled = true
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('error', onError)
    }
  }, [selectedRecord?.id, videoSrc, seekSec, isEventClip, muted, volume])

  useEffect(() => {
    const video = videoRef.current
    if (!video || isEventClip) return

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime)
      if (video.duration) setProgress((video.currentTime / video.duration) * 100)
    }
    const onDuration = () => setDuration(video.duration)

    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDuration)
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDuration)
    }
  }, [selectedRecord?.id, isEventClip])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = volume / 100
    video.muted = muted || volume === 0
  }, [volume, muted])

  const handleSelectCamera = (cam: TrainingCamera) => {
    setActiveCam(cam)
    onSelectCamera?.(cam)
  }

  const handleSelectRecord = useCallback((record: CameraPlaybackRecord, seek = 0) => {
    setSelectedRecord(record)
    setSeekSec(seek)
    setProgress(0)
    setCurrentTime(0)
    setIsPlaying(false)
    setPlaybackError(null)
    onSelectRecord?.(record)
  }, [onSelectRecord])

  const handleTogglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.pause()
      setIsPlaying(false)
    } else {
      video.play().then(() => setIsPlaying(true)).catch(console.error)
    }
  }

  const handleScrub = (pct: number) => {
    const video = videoRef.current
    if (!video) return
    if (isEventClip && video.duration) {
      const clip = buildEventClipWindow(eventSeekSec, video.duration, eventClipSec)
      const next = clip.start + (pct / 100) * clip.duration
      video.currentTime = next
      setCurrentTime(next - clip.start)
      setProgress(pct)
      return
    }
    if (!duration) return
    const next = (pct / 100) * duration
    video.currentTime = next
    setCurrentTime(next)
    setProgress(pct)
  }

  const handleToggleMute = () => {
    setMuted(prev => {
      const next = !prev
      if (videoRef.current) videoRef.current.muted = next
      return next
    })
  }

  const handleVolumeChange = (nextVolume: number) => {
    setVolume(nextVolume)
    if (videoRef.current) videoRef.current.volume = nextVolume / 100
  }

  if (cameras.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[200px] p-6 text-center text-[11px] text-muted-foreground">
        Chưa có camera nào được cấu hình
      </div>
    )
  }

  if (!activeCam) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[200px]">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/60" />
      </div>
    )
  }

  const selectedIds = [activeCam.id]
  const eventCount = records.filter(r => r.type === 'event').length

  return (
    <CameraPanelShell
      cameras={cameras}
      selectedIds={selectedIds}
      onThumbClick={handleSelectCamera}
      thumbVariant="playback"
      sidebarTabbed
      hideStackedPortraitSidebar={isMobile}
      hideLandscapeMobileStrip
      locationFilterTabs={sidebarFilterTabs.length > 1 ? sidebarFilterTabs : undefined}
      activeLocationTab={sidebarTab}
      onLocationTabChange={setSidebarTab}
      sidebarGroups={sidebarGroups}
      sidebarSummary={(
        <>
          <span className="text-primary font-semibold">{eventCount || records.length}</span>
          {' '}
          bản ghi
        </>
      )}
      sidebarFooter={(
        <PlaybackDetectionsList
          detections={detections}
          loading={loadingDetections}
          embedded
        />
      )}
    >
      <div className={cn(
        'flex flex-col w-full min-h-0 flex-1 h-full overflow-hidden',
        isDesktop ? 'gap-1' : 'gap-1.5',
      )}>
        <div className={cn(
          'relative w-full min-h-0 flex-1',
        )}
        style={isDesktop && videoAreaFlex < 80 ? { flex: `1 1 ${videoAreaFlex}%` } : undefined}
        >
          <PlaybackVideoFrame
            cam={activeCam}
            videoSrc={videoSrc}
            loadingRecords={loadingRecords}
            selectedRecord={selectedRecord}
            videoRef={videoRef}
            muted={muted || volume === 0}
            activeEventRecord={activeEventRecord}
            playbackError={playbackError}
          />
        </div>

        {isMobile && (
          <PlaybackMobileStrip
            cameras={cameras}
            selectedIds={selectedIds}
            onThumbClick={handleSelectCamera}
            detections={detections}
            loadingDetections={loadingDetections}
            sidebarGroups={sidebarGroups}
            locationFilterTabs={sidebarFilterTabs.length > 1 ? sidebarFilterTabs : undefined}
            locationTab={sidebarTab}
            onLocationTabChange={setSidebarTab}
          />
        )}

        {isDesktop ? (
          <div className="shrink-0 flex flex-col gap-1 pt-0.5 border-t border-[#1e2433]/50">
            {activeEventRecord && selectedRecord?.type === 'event' && (
              <div className="max-h-[100px] overflow-y-auto rounded-lg border border-[#1e2433] bg-[#0a0e17]/80 mx-0.5">
                <SafetyEventDetailContent record={activeEventRecord} variant="playback" />
              </div>
            )}
            <PlaybackRecordTimeline
              compact
              records={records}
              selectedRecord={selectedRecord}
              onSelectRecord={handleSelectRecord}
            />
            <PlaybackControlBar
              date={date}
              onDateChange={handleDateChange}
              maxDate={maxDate}
              minDate={minDate}
              progress={progress}
              onScrub={handleScrub}
              isPlaying={isPlaying}
              onTogglePlay={handleTogglePlay}
              videoSrc={videoSrc}
              currentTime={currentTime}
              duration={duration}
              formatTime={formatPlaybackClock}
              muted={muted || volume === 0}
              onToggleMute={handleToggleMute}
              volume={volume}
              onVolumeChange={handleVolumeChange}
            />
          </div>
        ) : (
          <>
            {activeEventRecord && selectedRecord?.type === 'event' && (
              <div className="max-h-[120px] overflow-y-auto rounded-lg border border-[#1e2433] bg-[#0a0e17]/80 shrink-0">
                <SafetyEventDetailContent record={activeEventRecord} variant="playback" />
              </div>
            )}
            <PlaybackRecordTimeline
              records={records}
              selectedRecord={selectedRecord}
              onSelectRecord={handleSelectRecord}
            />
            <PlaybackMobileControls
              date={date}
              onDateChange={handleDateChange}
              maxDate={maxDate}
              minDate={minDate}
              progress={progress}
              onScrub={handleScrub}
              isPlaying={isPlaying}
              onTogglePlay={handleTogglePlay}
              videoSrc={videoSrc}
              currentTime={currentTime}
              duration={duration}
              formatTime={formatPlaybackClock}
              muted={muted || volume === 0}
              onToggleMute={handleToggleMute}
              volume={volume}
              onVolumeChange={handleVolumeChange}
            />
          </>
        )}
      </div>
    </CameraPanelShell>
  )
}
