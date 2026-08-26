import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock, MapPin, Play, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { formatEventDateTime } from '@/utils/format'
import type { PatrolEvent } from '../data/patrolMockData'
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
  getPatrolEventPlace,
  shouldShowPatrolStatusBadge,
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
  onPlayback?: (event: PatrolEvent) => void
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

function formatEventTimeRange(event: PatrolEvent): string {
  const locked = formatEventDateTime(event.lockedAt)
  const started = formatEventDateTime(event.startedAt)
  if (started === locked) return locked
  if (event.endedAt) {
    const ended = formatEventDateTime(event.endedAt)
    if (ended !== locked) return `${started} – ${ended}`
  }
  return `${started} – ${locked}`
}

function buildDetailRows(event: PatrolEvent): DetailRow[] {
  const stage = resolvePatrolPersonStage(event)
  const objectDisplay = resolveEventObjectDisplay(event)
  const cardDisplay = resolvePatrolPersonCardDisplay(event)
  const eventPlace = getPatrolEventPlace(event.cameraName, event.zoneName)
  const rows: DetailRow[] = []

  rows.push({ label: 'Thời gian', value: formatEventTimeRange(event), span: 2 })

  if (stage === 'profile') {
    if (objectDisplay.workerId) rows.push({ label: 'Mã', value: objectDisplay.workerId })
    if (objectDisplay.unit) rows.push({ label: 'Đơn vị', value: objectDisplay.unit })
  } else if (stage === 'person' && cardDisplay.workerId) {
    rows.push({ label: 'Mã', value: cardDisplay.workerId, span: 2 })
  } else if (objectDisplay.label.trim() && objectDisplay.label !== 'Đối tượng') {
    rows.push({ label: 'Track', value: objectDisplay.label, span: 2 })
  }

  const hasCamera = Boolean(event.cameraName?.trim())
  const hasZone = Boolean(event.zoneName?.trim() && event.zoneName !== 'Cầu Sông Hốt')
  if (hasCamera || hasZone) {
    rows.push({ label: 'Vị trí', value: eventPlace, span: 2 })
  }

  if (shouldShowPatrolStatusBadge(event.status) && event.status !== 'LOCKED') {
    const statusLabel = event.status === 'ENDED' ? 'Đã kết thúc' : event.status === 'PENDING' ? 'Chờ xác nhận' : 'Ghi nhận'
    rows.push({ label: 'Trạng thái', value: statusLabel, span: 2 })
  }

  return rows
}

export function PatrolEventDetailModal({ event, onClose, onPlayback }: PatrolEventDetailModalProps) {
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
              {(stage === 'profile' && objectDisplay.label !== modalTitle) && (
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {objectDisplay.label}
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

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-3 sm:p-4 space-y-3">
          {event.snapshotUrl && (
            <PatrolEventSnapshot event={event} variant="detail" />
          )}

          {detailRows.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px] rounded-lg border border-[#1e2433] bg-[#0c1019] px-3 py-2.5">
              {detailRows.map(({ label, value, span }) => (
                <div key={label} className={span === 2 ? 'col-span-2' : undefined}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-foreground font-medium mt-0.5">{value}</dd>
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

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                onPlayback?.(event)
                onClose()
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-semibold bg-primary text-primary-foreground hover:opacity-90"
            >
              <Play className="w-3 h-3" />
              Xem Playback
            </button>
            {gpsOk && (
              <a
                href={mapsUrl(event.gps.lat, event.gps.lng)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-semibold border border-[#1e2433] text-muted-foreground hover:text-foreground hover:bg-[#1a2235]"
              >
                <MapPin className="w-3 h-3" />
                Xem trên bản đồ
              </a>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
