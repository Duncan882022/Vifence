import { useEffect, useState } from 'react'
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
  onPlayback?: (event: PatrolEvent) => void
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

export function PatrolEventDetailModal({ event, onClose, onPlayback }: PatrolEventDetailModalProps) {
  const [identityTick, setIdentityTick] = useState(0)
  const [appearances, setAppearances] = useState<Record<string, PatrolAppearanceSegment[]>>({})

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
    if (!event) return
    const stage = resolvePatrolPersonStage(event)
    if (stage !== 'person' && stage !== 'profile') {
      setAppearances({})
      return
    }
    const subjectId = resolvePatrolAppearanceSubjectId(event)
    void fetchPatrolSubjectAppearances(subjectId).then(byCamera => {
      setAppearances(byCamera)
    })
  }, [event, identityTick])

  if (!event) return null
  void identityTick

  const meta = event.type === 'PERSON_DETECTED' || event.type === 'IDENTITY_VERIFIED'
    ? resolvePatrolEventDisplayMeta(event)
    : PATROL_TYPE_META[event.type]
  const TypeIcon = meta.icon
  const statusDisplay = getPatrolEventStatusDisplay(event.status)
  const gpsOk = hasValidGps(event.gps)
  const eventPlace = getPatrolEventPlace(event.cameraName, event.zoneName)
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
          event.snapshotUrl ? 'sm:max-w-3xl lg:max-w-4xl' : 'sm:max-w-lg',
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
              <p className="text-[9px] text-muted-foreground mt-0.5">
                {meta.label}
                {(stage === 'person' || stage === 'profile') && cardDisplay.subtitle !== '—'
                  ? ` · ${cardDisplay.subtitle}`
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
            <div className="shrink-0 space-y-1">
              <PatrolEventSnapshot event={event} variant="detail" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
            {[
              ['Trạng thái', statusDisplay.label],
              ['Vị trí', eventPlace],
              ...(objectDisplay.workerId ? [['Mã định danh', objectDisplay.workerId] as const] : []),
              ['Đối tượng', objectDisplay.label],
              ...(objectDisplay.unit ? [['Đơn vị', objectDisplay.unit] as const] : []),
              ['Ghi nhận', formatEventDateTime(event.lockedAt)],
              ['Bắt đầu', formatEventDateTime(event.startedAt)],
              ['Kết thúc', event.endedAt ? formatEventDateTime(event.endedAt) : '—'],
              ['Confidence', `${Math.round(event.confidence * 100)}%`],
            ].map(([k, v]) => (
              <div key={k} className={k === 'Vị trí' ? 'col-span-2' : undefined}>
                <span className="text-muted-foreground">{k}: </span>
                <span className="text-foreground font-medium">{v}</span>
              </div>
            ))}
          </div>

          {hasAppearanceHistory && (
            <div className="rounded-lg border border-[#1e2433] bg-[#0c1019] px-3 py-2.5 space-y-2">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wide">
                  Lịch sử xuất hiện
                </span>
              </div>
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
              <p className="text-[10px] text-foreground font-mono select-all">
                {event.gps.lat.toFixed(6)}, {event.gps.lng.toFixed(6)}
              </p>
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
            {gpsOk ? (
              <a
                href={mapsUrl(event.gps.lat, event.gps.lng)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-semibold border border-[#1e2433] text-muted-foreground hover:text-foreground hover:bg-[#1a2235]"
              >
                <MapPin className="w-3 h-3" />
                Xem trên bản đồ
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-semibold border border-[#1e2433] text-muted-foreground/50 cursor-not-allowed"
              >
                <MapPin className="w-3 h-3" />
                Chưa có GPS
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
