import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock, MapPin, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { formatEventDateTime } from '@/utils/format'
import type { PatrolEvent } from '../data/patrolMockData'
import { formatPatrolTime } from '../data/patrolMockData'
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
  PATROL_TYPE_META,
  getPatrolEventStatusDisplay,
} from '../utils/patrolEventsUi'
import {
  resolvePatrolAppearanceSubjectId,
  resolvePatrolEventDisplayMeta,
  resolvePatrolPersonStage,
} from '../utils/patrolWorkforceEventLabels'
import { PATROL_BODYCAM_LABELS } from '../data/patrolCameras'

interface PatrolEventDetailModalProps {
  event: PatrolEvent | null
  onClose: () => void
}

interface DetailRow {
  label: string
  value: string
  span?: 2
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

function resolveEventLocation(event: PatrolEvent): string {
  const camLabel = event.cameraId?.trim()
    ? (PATROL_BODYCAM_LABELS[event.cameraId] ?? (event.cameraName?.trim() || event.cameraId))
    : (event.cameraName?.trim() || '')
  const zoneLabel = event.zoneName?.trim() || ''
  if (camLabel && zoneLabel) return `${camLabel} · ${zoneLabel}`
  if (camLabel) return camLabel
  if (zoneLabel) return zoneLabel
  return 'Chưa gắn camera'
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

function buildDetailRows(event: PatrolEvent): DetailRow[] {
  const stage = resolvePatrolPersonStage(event)
  const meta = resolvePatrolEventDisplayMeta(event)
  const objectDisplay = resolveEventObjectDisplay(event)
  const cardDisplay = resolvePatrolPersonCardDisplay(event)
  const statusDisplay = getPatrolEventStatusDisplay(event.status)
  const subjectId = event.objectId?.trim() || event.id
  const rows: DetailRow[] = []

  rows.push({ label: 'Giai đoạn', value: meta.label })
  rows.push({ label: 'Mã', value: subjectId })

  const trackId = event.trackWorkerId?.trim()
  if (trackId && trackId !== subjectId) {
    rows.push({ label: 'Track', value: trackId })
  }

  if (stage === 'profile') {
    if (objectDisplay.workerId && objectDisplay.workerId !== subjectId) {
      rows.push({ label: 'Mã định danh', value: objectDisplay.workerId })
    }
    if (objectDisplay.unit) rows.push({ label: 'Đơn vị', value: objectDisplay.unit })
  } else if (stage === 'person' && cardDisplay.workerId) {
    rows.push({ label: 'Mã tạm', value: cardDisplay.workerId })
  }

  const displayName = stage === 'object'
    ? (event.objectLabel?.trim() || 'Đối tượng')
    : objectDisplay.label
  if (displayName && displayName !== meta.label && displayName !== 'Đối tượng') {
    rows.push({ label: 'Tên', value: displayName, span: 2 })
  }

  rows.push({ label: 'Vị trí', value: resolveEventLocation(event), span: 2 })
  rows.push({ label: 'Trạng thái', value: statusDisplay.label })
  rows.push({ label: 'Bắt đầu', value: formatEventDateTime(event.startedAt) })
  rows.push({ label: 'Ghi nhận', value: formatEventDateTime(event.lockedAt) })

  if (event.endedAt) {
    rows.push({ label: 'Kết thúc', value: formatEventDateTime(event.endedAt), span: 2 })
  }

  const duration = resolveEventDurationSeconds(event)
  if (duration != null) {
    rows.push({ label: 'Thời lượng', value: formatPatrolTime(duration), span: 2 })
  }

  if (event.confidence > 0) {
    rows.push({
      label: 'Độ tin cậy',
      value: `${Math.round(event.confidence * 100)}%`,
      span: 2,
    })
  }

  return rows
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

  const detailRows = useMemo(() => (event ? buildDetailRows(event) : []), [event])

  if (!event) return null
  void identityTick

  const meta = event.type === 'PERSON_DETECTED' || event.type === 'IDENTITY_VERIFIED'
    ? resolvePatrolEventDisplayMeta(event)
    : PATROL_TYPE_META[event.type]
  const TypeIcon = meta.icon
  const gpsOk = hasValidGps(event.gps)
  const objectKey = event.objectId?.trim() || event.id
  const objectDisplay = resolveEventObjectDisplay(event)
  const cardDisplay = resolvePatrolPersonCardDisplay(event)
  const stage = resolvePatrolPersonStage(event)
  const modalTitle = (stage === 'person' || stage === 'profile') ? cardDisplay.title : event.violationLabel
  const showIdentify = needsPatrolManualIdentity(objectKey, event.objectLabel)
    || isPatrolManuallyIdentified(objectKey)
  const appearanceCameras = Object.keys(appearances)
  const hasAppearanceHistory = appearanceCameras.length > 0

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-[2px] p-0 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          'relative flex flex-col w-full max-h-[96dvh] sm:max-h-[92vh] rounded-t-2xl sm:rounded-xl border border-[#2a3855] bg-[#0a0e17] shadow-2xl shadow-black/60',
          event.snapshotUrl ? 'sm:max-w-xl lg:max-w-2xl' : 'sm:max-w-md',
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
                {meta.label}
                {(stage === 'person' || stage === 'profile') && cardDisplay.subtitle !== '—'
                  ? ` · ${cardDisplay.subtitle}`
                  : ''}
                {(stage === 'profile' && objectDisplay.label !== modalTitle) && objectDisplay.label !== meta.label
                  ? ` · ${objectDisplay.label}`
                  : ''}
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

          {detailRows.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px] rounded-lg border border-[#1e2433] bg-[#0c1019] px-3 py-2.5">
              {detailRows.map(({ label, value, span }) => (
                <div key={label} className={span === 2 ? 'col-span-2' : undefined}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-foreground font-medium mt-0.5 break-all">{value}</dd>
                </div>
              ))}
            </dl>
          )}

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
                    const camLabel = PATROL_BODYCAM_LABELS[cameraId] ?? cameraId
                    return (
                      <div key={cameraId} className="space-y-1">
                        <p className="text-[9px] font-medium text-muted-foreground">{camLabel}</p>
                        {blocks.map((block, index) => (
                          <div
                            key={`${cameraId}-${block.startedAt}-${index}`}
                            className="rounded border border-[#1e2433] bg-[#0a0e17] px-2 py-1.5 text-[9px] text-foreground/90"
                          >
                            <span className="tabular-nums font-medium">
                              {formatAppearanceTimeRange(block.startedAt, block.endedAt)}
                            </span>
                            {block.zoneId && (
                              <span className="text-muted-foreground ml-1.5">· {block.zoneId}</span>
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
                GPS ghi nhận
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
