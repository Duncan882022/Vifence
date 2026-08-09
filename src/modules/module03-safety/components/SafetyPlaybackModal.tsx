import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Play, X } from 'lucide-react'
import { SafetyPlayback } from './SafetyPlayback'
import type { Event } from '@/types/event'

interface SafetyPlaybackModalProps {
  open: boolean
  event?: Event | null
  onClose: () => void
}

/** Popup xem lại clip vi phạm — căn giữa mobile & desktop */
export function SafetyPlaybackModal({ open, event, onClose }: SafetyPlaybackModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open || !event) return null

  const scenarioName = event.scenario ?? event.type

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative flex flex-col overflow-hidden w-full max-w-lg sm:max-w-[960px] sm:w-[92vw] max-h-[92dvh] sm:max-h-[88dvh] rounded-xl border border-[#2a3855] bg-[#0a0e17] shadow-2xl shadow-black/60"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="safety-playback-dialog-title"
      >
        <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2 border-b border-[#1e2433] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Play className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p id="safety-playback-dialog-title" className="text-sm font-semibold text-foreground">
                Xem lại
              </p>
              <p className="text-[10px] text-muted-foreground truncate">{scenarioName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[#1e2433] text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <SafetyPlayback event={event} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
