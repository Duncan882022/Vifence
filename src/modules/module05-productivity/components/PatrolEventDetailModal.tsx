import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MapPin, Play, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { formatEventDateTime } from '@/utils/format'
import type { PatrolEvent } from '../data/patrolMockData'
import { PatrolEventSnapshot } from './PatrolEventSnapshot'
import {
  PATROL_TYPE_META,
  getPatrolEventPlace,
  getPatrolEventStatusDisplay,
} from '../utils/patrolEventsUi'

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

  if (!event) return null

  const meta = PATROL_TYPE_META[event.type]
  const TypeIcon = meta.icon
  const statusDisplay = getPatrolEventStatusDisplay(event.status)
  const gpsOk = hasValidGps(event.gps)
  const eventPlace = getPatrolEventPlace(event.cameraName, event.zoneName)

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-[2px] p-0 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative flex flex-col overflow-hidden w-full sm:max-w-lg max-h-[92dvh] sm:max-h-[88vh] rounded-t-2xl sm:rounded-xl border border-[#2a3855] bg-[#0a0e17] shadow-2xl shadow-black/60"
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
                {event.violationLabel}
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5">{meta.label}</p>
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

        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3">
          <PatrolEventSnapshot event={event} className="w-full min-h-[140px] max-w-[220px]" />

          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
            {[
              ['Trạng thái', statusDisplay.label],
              ['Vị trí', eventPlace],
              ['Đối tượng', event.objectLabel],
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
