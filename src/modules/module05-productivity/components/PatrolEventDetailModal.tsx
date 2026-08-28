import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock, MapPin, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { isPortraitPatrolCameraId } from '@/modules/module02-training/data/trainingCameraFeeds'
import { formatEventDateTime } from '@/utils/format'
import type { PatrolEvent } from '../data/patrolTypes'
import { formatPatrolTime } from '../data/patrolTypes'
import { PatrolEventSnapshot } from './PatrolEventSnapshot'
import { PatrolManualIdentityPanel } from './PatrolManualIdentityPanel'
import { needsPatrolManualIdentity, isPatrolManuallyIdentified, suggestPatrolWorkerId } from '../services/patrolManualIdentity.service'
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

interface PatrolEventDetailModalProps {
  event: PatrolEvent | null
  onClose: () => void
}

function hasValidGps(gps: { lat: number; lng: number } | null | undefined): gps is { lat: number; lng: number } {
  if (!gps) return false
  const { lat, lng } = gps
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat === 0 && lng === 0) return false
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false
  return true
}

function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`
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

export function PatrolEventDetailModal({ event, onClose }: PatrolEventDetailModalProps) {
  const [identityTick, setIdentityTick] = useState(0)
  const [appearances, setAppearances] = useState<Record<string, PatrolAppearanceSegment[]>>({})
  const [appearancesLoading, setAppearancesLoading] = useState(false)

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
    if (!event) {
      setAppearances({})
      setAppearancesLoading(false)
      return
    }
    const stage = resolvePatrolPersonStage(event)
    if (stage !== 'person' && stage !== 'profile') {
      setAppearances({})
      setAppearancesLoading(false)
      return
    }
    const subjectId = resolvePatrolAppearanceSubjectId(event)
    let cancelled = false
    setAppearancesLoading(true)
    void fetchPatrolSubjectAppearances(subjectId).then(byCamera => {
      if (cancelled) return
      setAppearances(byCamera)
      setAppearancesLoading(false)
    })
    return () => { cancelled = true }
  }, [event, identityTick])

  const summary = useMemo(() => {
    if (!event) return null
    const stage = resolvePatrolPersonStage(event)
    const stageMeta = PATROL_PERSON_STAGE_META[stage]
    const cardDisplay = resolvePatrolPersonCardDisplay(event)
    const objectDisplay = resolveEventObjectDisplay(event)
    const appearanceCameras = Object.keys(appearances)
    const cameraLabel = resolvePrimaryCameraLabel(event, appearanceCameras)
    const duration = resolveEventDurationSeconds(event)

    const infoRows: Array<{ label: string; value: string }> = []
    if (stage === 'profile') {
      if (objectDisplay.label && objectDisplay.label !== 'Đối tượng') {
        infoRows.push({ label: 'Họ tên', value: objectDisplay.label })
      }
      if (objectDisplay.workerId) infoRows.push({ label: 'Mã nhân viên', value: objectDisplay.workerId })
      if (objectDisplay.unit) infoRows.push({ label: 'Đơn vị', value: objectDisplay.unit })
    } else if (stage === 'person') {
      if (cardDisplay.workerId) infoRows.push({ label: 'Mã theo dõi', value: cardDisplay.workerId })
    } else {
      infoRows.push({ label: 'Mã', value: event.objectId || event.id })
    }

    if (cameraLabel) infoRows.push({ label: 'Camera', value: cameraLabel })

    return {
      stage,
      stageMeta,
      cardDisplay,
      timeRange: formatEventTimeRange(event),
      duration,
      infoRows,
    }
  }, [event, appearances])

  if (!event || !summary) return null
  void identityTick

  const meta = resolvePatrolEventDisplayMeta(event)
  const TypeIcon = meta.icon
  const gpsOk = hasValidGps(event.gps)
  const objectKey = event.objectId?.trim() || event.id
  const stage = summary.stage
  const modalTitle = (stage === 'person' || stage === 'profile')
    ? summary.cardDisplay.title
    : event.violationLabel
  const showIdentify = needsPatrolManualIdentity(objectKey, event.objectLabel)
    || isPatrolManuallyIdentified(objectKey)
  const appearanceCameras = Object.keys(appearances)
  const hasAppearanceHistory = appearanceCameras.length > 0
  const portraitEvidence = Boolean(event.snapshotUrl && isPortraitPatrolCameraId(event.cameraId))

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-[2px] p-0 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          'relative flex flex-col w-full max-h-[96dvh] sm:max-h-[92vh] rounded-t-2xl sm:rounded-xl border border-[#2a3855] bg-[#0a0e17] shadow-2xl shadow-black/60',
          portraitEvidence
            ? 'sm:max-w-[min(96vw,calc(92dvh*9/16+2rem))]'
            : event.snapshotUrl
              ? 'sm:max-w-xl lg:max-w-2xl'
              : 'sm:max-w-md',
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
              <p className="text-[9px] text-muted-foreground mt-0.5 truncate">
                {summary.stageMeta.label}
                {summary.cardDisplay.subtitle !== '—' ? ` · ${summary.cardDisplay.subtitle}` : ''}
              </p>
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

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-3 sm:p-4 space-y-3">
          {event.snapshotUrl && (
            <PatrolEventSnapshot event={event} variant="detail" />
          )}

          {summary.infoRows.length > 0 && (
            <div className="rounded-lg border border-[#1e2433] bg-[#0c1019] px-3 py-2.5 space-y-2">
              <p className="text-[10px] font-semibold text-foreground uppercase tracking-wide">Thông tin</p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
                {summary.infoRows.map(row => (
                  <div key={row.label}>
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd className="text-foreground font-medium mt-0.5 break-all">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

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

          {(appearancesLoading || hasAppearanceHistory) && (stage === 'person' || stage === 'profile') && (
            <div className="rounded-lg border border-[#1e2433] bg-[#0c1019] px-3 py-2.5 space-y-2">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wide">
                  Lịch sử xuất hiện
                </span>
              </div>
              {appearancesLoading && !hasAppearanceHistory ? (
                <p className="text-[9px] text-muted-foreground/70">Đang tải…</p>
              ) : (
                <div className="space-y-2">
                  {appearanceCameras.map(cameraId => {
                    const blocks = appearances[cameraId] ?? []
                    const camLabel = resolvePatrolCameraDisplayName(cameraId) || cameraId
                    return (
                      <div key={cameraId} className="space-y-1">
                        <p className="text-[9px] font-medium text-muted-foreground">{camLabel}</p>
                        {blocks.map((block, index) => (
                          <div
                            key={`${cameraId}-${block.startedAt}-${index}`}
                            className="rounded border border-[#1e2433] bg-[#0a0e17] px-2 py-1.5 text-[9px] text-foreground/90 space-y-0.5"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="tabular-nums font-medium">
                                {formatAppearanceTimeRange(block.startedAt, block.endedAt)}
                              </span>
                              {block.presenceSeq != null && block.presenceSeq > 0 && (
                                <span className="text-sky-400/90 font-semibold">
                                  Lượt #{block.presenceSeq}
                                </span>
                              )}
                            </div>
                            {block.zoneId && (
                              <span className="text-muted-foreground">· {block.zoneId}</span>
                            )}
                            {block.gpsLat != null && block.gpsLng != null
                              && block.gpsLat !== 0 && block.gpsLng !== 0 && (
                              <a
                                href={mapsUrl(block.gpsLat, block.gpsLng)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-emerald-400/90 hover:text-emerald-300"
                              >
                                <MapPin className="w-2.5 h-2.5" />
                                {block.gpsLat.toFixed(5)}, {block.gpsLng.toFixed(5)}
                              </a>
                            )}
                            {(block.sourceCameras?.length ?? 0) > 1 && (
                              <span className="text-muted-foreground text-[8px]">
                                Mũ: {block.sourceCameras!.join(' · ')}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <div
            className={cn(
              'rounded-lg border px-3 py-2.5 space-y-1.5',
              gpsOk ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5',
            )}
          >
            <div className="flex items-center gap-1.5">
              <MapPin className={cn('w-3.5 h-3.5 shrink-0', gpsOk ? 'text-emerald-400' : 'text-amber-400')} />
              <span className="text-[10px] font-semibold text-foreground uppercase tracking-wide">
                Vị trí GPS
              </span>
              <span
                className={cn(
                  'ml-auto text-[8px] font-medium px-1.5 py-0.5 rounded',
                  gpsOk ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400',
                )}
              >
                {gpsOk ? 'Có toạ độ' : 'Thiếu GPS'}
              </span>
            </div>
            {gpsOk ? (
              <>
                <p className="text-[10px] text-foreground font-mono select-all">
                  {event.gps.lat.toFixed(6)}, {event.gps.lng.toFixed(6)}
                </p>
                <a
                  href={mapsUrl(event.gps.lat, event.gps.lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-semibold border border-[#1e2433] text-muted-foreground hover:text-foreground hover:bg-[#1a2235]"
                >
                  <MapPin className="w-3 h-3" />
                  Xem trên bản đồ
                </a>
              </>
            ) : (
              <p className="text-[9px] text-amber-200/80 leading-relaxed">
                Sự kiện chưa gắn toạ độ GPS. Bật Location trên HC-02 để log GPS cho sự kiện mới.
              </p>
            )}
          </div>

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
    </div>,
    document.body,
  )
}
