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
              ['Camera', event.cameraName],
              ['Zone', event.zoneName],
              ['Object ID', event.objectLabel],
              ['Bắt đầu', formatEventDateTime(event.startedAt)],
              ['Ghi nhận', formatEventDateTime(event.lockedAt)],
              ['Kết thúc', event.endedAt ? formatEventDateTime(event.endedAt) : '—'],
              ['Confidence', `${Math.round(event.confidence * 100)}%`],
              ['GPS', `${event.gps.lat.toFixed(5)}, ${event.gps.lng.toFixed(5)}`],
            ].map(([k, v]) => (
              <div key={k}>
                <span className="text-muted-foreground">{k}: </span>
                <span className="text-foreground font-medium">{v}</span>
              </div>
            ))}
          </div>

          <p className="text-[9px] text-muted-foreground">
            {getPatrolEventPlace(event.cameraName, event.zoneName)}
          </p>

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
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-semibold border border-[#1e2433] text-muted-foreground hover:text-foreground hover:bg-[#1a2235]"
            >
              <MapPin className="w-3 h-3" />
              Xem trên bản đồ
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
