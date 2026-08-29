import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Building2,
  Camera,
  Clock,
  Hash,
  History,
  ImageOff,
  Info,
  MapPin,
  User,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { formatEventDateTime } from '@/utils/format'
import { formatVnDate } from '@/utils/vnDateTime'
import type { PatrolEvent } from '../data/patrolTypes'
import { formatPatrolTime } from '../data/patrolTypes'
import { PatrolEventSnapshot, preloadPatrolEventSnapshot } from './PatrolEventSnapshot'
import { PatrolManualIdentityPanel } from './PatrolManualIdentityPanel'
import { needsPatrolManualIdentity, suggestPatrolWorkerId } from '../services/patrolManualIdentity.service'
import {
  fetchPatrolSubjectAppearances,
  formatAppearanceTimeRange,
  type PatrolAppearanceSegment,
} from '../services/patrolDayEvents.service'
import { resolveEventObjectDisplay, resolvePatrolPersonCardDisplay } from '../utils/patrolManualIdentityUi'
import {
  resolvePatrolAppearanceSubjectId,
  resolvePatrolEventDisplayMeta,
  resolvePatrolPersonStage,
  PATROL_PERSON_STAGE_META,
} from '../utils/patrolWorkforceEventLabels'
import { getPatrolEventLocationLabel } from '../utils/patrolEventsUi'
import { resolvePatrolCameraDisplayName } from '../data/patrolCameras'
import { PATROL_SITE_CENTER } from '../data/patrolSiteMap'

interface PatrolEventDetailModalProps {
  event: PatrolEvent | null
  /** Ngày lịch VN đang xem — bắt buộc để load lịch sử xuất hiện đúng ngày. */
  viewDate?: string
  onClose: () => void
}

interface PatrolInfoRow {
  icon: LucideIcon
  label: string
  value: string
  iconClassName: string
}

function PatrolDetailRow({ icon: Icon, label, value, iconClassName }: PatrolInfoRow) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 border border-[#1e2433] bg-[#0a0e17]">
        <Icon className={cn('w-3.5 h-3.5', iconClassName)} aria-hidden />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[8px] uppercase tracking-wide text-muted-foreground/70">{label}</p>
        <p className="text-[11px] text-foreground font-medium mt-0.5 leading-snug break-all">{value}</p>
      </div>
    </div>
  )
}

function splitInfoColumns(rows: PatrolInfoRow[]): [PatrolInfoRow[], PatrolInfoRow[]] {
  if (rows.length <= 1) return [rows, []]
  const mid = Math.ceil(rows.length / 2)
  return [rows.slice(0, mid), rows.slice(mid)]
}

function appearanceRowKey(segment: PatrolAppearanceSegment): string {
  if (segment.id != null) return String(segment.id)
  return `${segment.cameraId}-${segment.startedAt}`
}

/** So sánh snapshot — bỏ query v= bust, cùng file path = cùng ảnh. */
function snapshotStorageKey(url: string | undefined | null): string {
  const raw = url?.trim()
  if (!raw) return ''
  try {
    const u = new URL(raw, 'https://placeholder.local')
    const path = u.searchParams.get('path')
    if (path) return decodeURIComponent(path)
    return u.pathname
  } catch {
    return raw.split('?')[0] ?? raw
  }
}

function dedupeAppearanceSegments(segments: PatrolAppearanceSegment[]): PatrolAppearanceSegment[] {
  const seen = new Set<string>()
  return segments.filter(segment => {
    const key = appearanceRowKey(segment)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function resolveDefaultAppearanceKey(
  segments: PatrolAppearanceSegment[],
  event: PatrolEvent,
): string | null {
  if (segments.length === 0) return null

  const eventSnapKey = snapshotStorageKey(event.snapshotUrl)
  if (eventSnapKey) {
    const matched = segments.find(
      segment => snapshotStorageKey(segment.snapshotUrl) === eventSnapKey,
    )
    if (matched) return appearanceRowKey(matched)
  }

  const eventEndSec = Math.round(Date.parse(event.lockedAt) / 1000)
  if (Number.isFinite(eventEndSec)) {
    const containing = segments.find(
      segment => eventEndSec >= segment.startedAt && eventEndSec <= segment.endedAt,
    )
    if (containing) return appearanceRowKey(containing)

    let best = segments[0]
    let bestDelta = Math.abs(best.endedAt - eventEndSec)
    for (const segment of segments) {
      const delta = Math.abs(segment.endedAt - eventEndSec)
      if (delta < bestDelta) {
        best = segment
        bestDelta = delta
      }
    }
    return appearanceRowKey(best)
  }

  return appearanceRowKey(segments[0])
}

function resolveAppearanceGps(segment: PatrolAppearanceSegment): { lat: number; lng: number } {
  const lat = segment.gpsLatEnd ?? segment.gpsLat ?? null
  const lng = segment.gpsLngEnd ?? segment.gpsLng ?? null
  if (lat != null && lng != null && lat !== 0 && lng !== 0
    && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng }
  }
  return { lat: PATROL_SITE_CENTER[0], lng: PATROL_SITE_CENTER[1] }
}

function resolveAppearanceCameraLabel(segment: PatrolAppearanceSegment): string {
  return getPatrolEventLocationLabel(
    resolvePatrolCameraDisplayName(segment.cameraId) || segment.cameraId,
    segment.zoneId ?? '',
    segment.cameraId,
  )
}

function formatEventTimeRange(event: PatrolEvent): string {
  const first = formatEventDateTime(event.startedAt)
  const last = formatEventDateTime(event.lockedAt)
  if (first === last) return last
  if (event.endedAt) {
    const ended = formatEventDateTime(event.endedAt)
    if (ended !== last) return `${first} – ${ended}`
  }
  return `${first} – ${last}`
}

function resolveEventDurationSeconds(event: PatrolEvent): number | null {
  if (event.durationSeconds != null && event.durationSeconds > 0) {
    return event.durationSeconds
  }
  const started = Date.parse(event.startedAt)
  const ended = event.endedAt ? Date.parse(event.endedAt) : Date.parse(event.lockedAt)
  if (!Number.isFinite(started) || !Number.isFinite(ended)) return null
  const seconds = Math.max(0, Math.round((ended - started) / 1000))
  return seconds > 0 ? seconds : null
}

function resolveEventDisplayName(
  event: PatrolEvent,
  objectDisplay: ReturnType<typeof resolveEventObjectDisplay>,
): string | null {
  const fromManual = objectDisplay.label?.trim()
  if (fromManual && fromManual !== 'Đối tượng' && fromManual !== 'Unknown') return fromManual
  const fromEvent = event.violationLabel?.trim() || event.objectLabel?.trim()
  if (fromEvent && fromEvent !== 'Đối tượng') return fromEvent
  return null
}

function resolvePrimaryCameraLabel(
  event: PatrolEvent,
  appearanceCameras: string[],
): string | null {
  const locationLabel = getPatrolEventLocationLabel(
    event.cameraName,
    event.zoneName,
    event.cameraId,
  ).trim()
  if (locationLabel) return locationLabel
  if (appearanceCameras.length > 0) {
    const id = appearanceCameras[0]
    return getPatrolEventLocationLabel('', event.zoneName, id)
  }
  return null
}

export function PatrolEventDetailModal({ event, viewDate, onClose }: PatrolEventDetailModalProps) {
  const [identityTick, setIdentityTick] = useState(0)
  const [appearanceSegments, setAppearanceSegments] = useState<PatrolAppearanceSegment[]>([])
  const [appearancesLoading, setAppearancesLoading] = useState(false)
  const [selectedAppearanceKey, setSelectedAppearanceKey] = useState<string | null>(null)

  useEffect(() => {
    if (!event) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [event, onClose])

  useEffect(() => {
    setSelectedAppearanceKey(null)
  }, [event?.id])

  useEffect(() => {
    if (!event) {
      setAppearanceSegments([])
      setAppearancesLoading(false)
      return
    }
    const stage = resolvePatrolPersonStage(event)
    if (stage !== 'person' && stage !== 'profile' && stage !== 'object') {
      setAppearanceSegments([])
      setAppearancesLoading(false)
      return
    }
    const subjectId = resolvePatrolAppearanceSubjectId(event)
    const appearanceDate = viewDate ?? formatVnDate(new Date(event.lockedAt || event.startedAt))
    let cancelled = false
    setAppearancesLoading(true)
    void fetchPatrolSubjectAppearances(subjectId, appearanceDate).then(segments => {
      if (cancelled) return
      const sorted = dedupeAppearanceSegments(
        [...segments].sort((a, b) => b.startedAt - a.startedAt),
      )
      setAppearanceSegments(sorted)
      setSelectedAppearanceKey(prev => {
        if (prev && sorted.some(segment => appearanceRowKey(segment) === prev)) return prev
        return resolveDefaultAppearanceKey(sorted, event)
      })
      setAppearancesLoading(false)
    })
    return () => { cancelled = true }
  }, [event?.id, identityTick, viewDate])

  const summary = useMemo(() => {
    if (!event) return null
    const stage = resolvePatrolPersonStage(event)
    const stageMeta = PATROL_PERSON_STAGE_META[stage]
    const cardDisplay = resolvePatrolPersonCardDisplay(event)
    const objectDisplay = resolveEventObjectDisplay(event)
    const appearanceCameraIds = [...new Set(appearanceSegments.map(s => s.cameraId))]
    const cameraLabel = resolvePrimaryCameraLabel(event, appearanceCameraIds)
    const duration = resolveEventDurationSeconds(event)

    const infoRows: PatrolInfoRow[] = []
    const displayName = resolveEventDisplayName(event, objectDisplay)
    if (stage === 'profile') {
      if (displayName) {
        infoRows.push({
          icon: User,
          label: 'Họ tên',
          value: displayName,
          iconClassName: 'text-fuchsia-400',
        })
      }
      if (objectDisplay.workerId) {
        infoRows.push({
          icon: Hash,
          label: 'Mã nhân viên',
          value: objectDisplay.workerId,
          iconClassName: 'text-sky-400',
        })
      }
      if (objectDisplay.unit) {
        infoRows.push({
          icon: Building2,
          label: 'Đơn vị',
          value: objectDisplay.unit,
          iconClassName: 'text-amber-400/90',
        })
      }
    } else if (stage === 'person') {
      if (cardDisplay.workerId) {
        infoRows.push({
          icon: Hash,
          label: 'Mã theo dõi',
          value: cardDisplay.workerId,
          iconClassName: 'text-orange-400',
        })
      }
    } else {
      infoRows.push({
        icon: Hash,
        label: 'Mã',
        value: event.objectId || event.id,
        iconClassName: 'text-stone-400',
      })
    }

    if (cameraLabel) {
      infoRows.push({
        icon: Camera,
        label: 'Vị trí',
        value: cameraLabel,
        iconClassName: 'text-cyan-400',
      })
    }

    const [infoPrimary, infoSecondary] = splitInfoColumns(infoRows)

    return {
      stage,
      stageMeta,
      cardDisplay,
      timeRange: formatEventTimeRange(event),
      duration,
      infoPrimary,
      infoSecondary,
    }
  }, [event, appearanceSegments])

  const activeSnapshotUrl = useMemo(() => {
    if (selectedAppearanceKey) {
      const selected = appearanceSegments.find(s => appearanceRowKey(s) === selectedAppearanceKey)
      if (selected?.snapshotUrl?.trim()) return selected.snapshotUrl
    }
    return event?.snapshotUrl
  }, [appearanceSegments, event?.snapshotUrl, selectedAppearanceKey])

  if (!event || !summary) return null
  void identityTick

  const meta = resolvePatrolEventDisplayMeta(event)
  const TypeIcon = meta.icon
  const objectKey = event.objectId?.trim() || event.id
  const stage = summary.stage
  const modalTitle = (stage === 'person' || stage === 'profile')
    ? summary.cardDisplay.title
    : event.violationLabel
  const showIdentify = stage !== 'profile'
    && needsPatrolManualIdentity(objectKey, event.objectLabel)
  const hasAppearanceHistory = appearanceSegments.length > 0
  const showAppearanceHistory = (stage === 'person' || stage === 'profile' || stage === 'object')
    && (appearancesLoading || hasAppearanceHistory)
  const showTimeSection = !hasAppearanceHistory

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-[2px] p-0 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          'relative flex flex-col w-full max-h-[96dvh] sm:max-h-[92vh] rounded-t-2xl sm:rounded-xl border border-[#2a3855] bg-[#0a0e17] shadow-2xl shadow-black/60',
          activeSnapshotUrl ? 'sm:max-w-xl lg:max-w-2xl' : 'sm:max-w-md',
        )}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="patrol-event-detail-title"
      >
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-[#1e2433] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border', meta.badge)}>
              <TypeIcon className={cn('w-3.5 h-3.5', meta.color)} aria-hidden />
            </div>
            <div className="min-w-0">
              <p id="patrol-event-detail-title" className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2">
                {modalTitle}
              </p>
              {stage !== 'profile' && (
                <p className="text-[9px] text-muted-foreground mt-0.5 truncate">
                  {summary.stageMeta.label}
                  {summary.cardDisplay.subtitle !== '—' ? ` · ${summary.cardDisplay.subtitle}` : ''}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#1e2433] text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col flex-1 min-h-0">
          {activeSnapshotUrl && (
            <div className="shrink-0 px-3 sm:px-4 pt-3 sm:pt-4 pb-2 border-b border-[#1e2433]/70 bg-[#0a0e17]">
              <PatrolEventSnapshot
                key={`${event.id}:${selectedAppearanceKey ?? 'event'}:${activeSnapshotUrl}`}
                event={event}
                snapshotUrl={activeSnapshotUrl}
                variant="detail"
              />
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-3 sm:p-4 space-y-3">
          {(summary.infoPrimary.length > 0 || summary.infoSecondary.length > 0) && (
            <div className="rounded-lg border border-[#1e2433] bg-[#0c1019] px-3 py-2.5 space-y-2.5">
              <div className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-violet-400 shrink-0" aria-hidden />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wide">
                  Thông tin
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <div className="space-y-3">
                  {summary.infoPrimary.map(row => (
                    <PatrolDetailRow key={row.label} {...row} />
                  ))}
                </div>
                {summary.infoSecondary.length > 0 && (
                  <div className="space-y-3">
                    {summary.infoSecondary.map(row => (
                      <PatrolDetailRow key={row.label} {...row} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {showTimeSection && (
            <div className="rounded-lg border border-[#1e2433] bg-[#0c1019] px-3 py-2.5 space-y-1">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wide">Thời gian</span>
              </div>
              <p className="text-[11px] text-foreground font-medium tabular-nums">{summary.timeRange}</p>
              {summary.duration != null && (
                <p className="text-[9px] text-muted-foreground">
                  Tổng thời lượng quan sát: {formatPatrolTime(summary.duration)}
                </p>
              )}
            </div>
          )}

          {showAppearanceHistory && (
            <div className="rounded-lg border border-[#1e2433] bg-[#0c1019] px-3 py-2.5 space-y-2">
              <div className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wide">
                  Lịch sử xuất hiện
                </span>
              </div>
              {appearancesLoading && !hasAppearanceHistory ? (
                <p className="text-[9px] text-muted-foreground/70">Đang tải…</p>
              ) : (
                <div className="space-y-1.5">
                  {appearanceSegments.map(segment => {
                    const rowKey = appearanceRowKey(segment)
                    const selected = selectedAppearanceKey === rowKey
                    const gps = resolveAppearanceGps(segment)
                    const camLabel = resolveAppearanceCameraLabel(segment)
                    const thumbUrl = segment.snapshotUrl?.trim()
                    return (
                      <button
                        key={rowKey}
                        type="button"
                        onClick={() => {
                          if (thumbUrl) preloadPatrolEventSnapshot(thumbUrl)
                          setSelectedAppearanceKey(rowKey)
                        }}
                        className={cn(
                          'w-full flex items-stretch gap-2.5 rounded-lg border px-2 py-2 text-left transition-colors',
                          selected
                            ? 'border-sky-400/50 bg-sky-500/10 ring-1 ring-sky-400/30'
                            : 'border-[#1e2433] bg-[#0a0e17] hover:border-[#2a3855] hover:bg-[#0d121c]',
                        )}
                      >
                        <div className="relative w-[72px] h-[52px] shrink-0 overflow-hidden rounded-md border border-[#1e2433]/90 bg-black">
                          {thumbUrl ? (
                            <img
                              key={rowKey}
                              src={thumbUrl}
                              alt=""
                              className="absolute inset-0 h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
                              <ImageOff className="w-4 h-4" aria-hidden />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1 py-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] tabular-nums font-semibold text-foreground">
                              {formatAppearanceTimeRange(segment.startedAt, segment.endedAt)}
                            </span>
                            {segment.presenceSeq != null && segment.presenceSeq > 0 && (
                              <span className="text-[8px] text-sky-400/90 font-semibold">
                                Lượt #{segment.presenceSeq}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 min-w-0">
                            <Camera className="w-3 h-3 text-cyan-400/80 shrink-0" aria-hidden />
                            <span className="text-[9px] text-foreground/90 truncate">{camLabel}</span>
                          </div>
                          <div className="flex items-center gap-1 min-w-0">
                            <MapPin className="w-3 h-3 text-emerald-400/80 shrink-0" aria-hidden />
                            <span className="text-[9px] text-muted-foreground font-mono truncate">
                              {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
                              {(segment.gpsLat == null && segment.gpsLatEnd == null) && (
                                <span className="text-muted-foreground/60"> · mặc định</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {showIdentify && (
            <PatrolManualIdentityPanel
              objectKey={objectKey}
              suggestedWorkerId={suggestPatrolWorkerId(objectKey, event.objectId)}
              snapshotUrl={event.snapshotUrl}
              cameraId={event.cameraId}
              trackId={event.trackWorkerId}
              onAssigned={() => setIdentityTick(t => t + 1)}
            />
          )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
